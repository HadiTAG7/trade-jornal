/**
 * ThinkOrSwim Account Statement CSV Parser
 * 
 * Parses multi-section CSV files from TOS and reconstructs complete trades
 * from execution fills using FIFO matching.
 */

import { fromZonedTime } from 'date-fns-tz';
import { generateStableHash } from './calculations';

// Execution record from Account Trade History section
export interface Execution {
  execTime: Date;
  spread: string;
  side: 'BUY' | 'SELL';
  qty: number;
  posEffect: 'TO OPEN' | 'TO CLOSE';
  symbol: string;
  price: number;
  netPrice: number;
  orderType: string;
  refNumber?: string;
}

// Fee record from Cash Balance section
export interface FeeRecord {
  date: Date;
  refNumber: string;
  description: string;
  miscFees: number;
  commissions: number;
  amount: number;
}

// Reconstructed trade from matched executions
export interface ReconstructedTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryDatetime: string;
  exitDatetime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  commissions: number;
  grossPnL: number;
  netPnL: number;
  duration: number; // in minutes
  stableHash: string;
  isDuplicate?: boolean;
}

// Position tracking for FIFO matching
interface OpenPosition {
  execTime: Date;
  qty: number;
  price: number;
  refNumber?: string;
}

// Parsing result
export interface TOSParseResult {
  executions: Execution[];
  fees: FeeRecord[];
  completedTrades: ReconstructedTrade[];
  unmatchedOpens: { symbol: string; side: 'LONG' | 'SHORT'; qty: number; avgPrice: number }[];
  warnings: string[];
  errors: string[];
}

// Timezone options
export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'US Eastern (Market Time)' },
  { value: 'America/Chicago', label: 'US Central (CST/CDT)' },
  { value: 'America/Denver', label: 'US Mountain' },
  { value: 'America/Los_Angeles', label: 'US Pacific' },
  { value: 'Asia/Riyadh', label: 'Riyadh (Arabia Standard Time, UTC+3)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'UTC', label: 'UTC' },
];

const MARKET_TIMEZONE = 'America/New_York';

/**
 * Parse a CSV line handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let currentField = '';
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentField.trim());
      currentField = '';
    } else if (char !== '\r') {
      currentField += char;
    }
  }
  result.push(currentField.trim());
  return result;
}

/**
 * Remove BOM and clean text
 */
function cleanText(text: string): string {
  // Remove UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  // Also handle the ﻿ representation
  if (text.startsWith('\uFEFF')) {
    text = text.slice(1);
  }
  return text;
}

/**
 * Parse a number from TOS format (handles commas, quotes, $, =)
 */
function parseNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  // Remove quotes, =, $, commas
  const cleaned = value.replace(/["=$,]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse quantity from TOS format (+125 or -125)
 */
function parseQuantity(value: string): { qty: number; sign: 'positive' | 'negative' } {
  if (!value || value.trim() === '') return { qty: 0, sign: 'positive' };
  const cleaned = value.trim();
  const isNegative = cleaned.startsWith('-');
  const qty = Math.abs(parseNumber(cleaned));
  return { qty, sign: isNegative ? 'negative' : 'positive' };
}

/**
 * Parse TOS date format (12/30/25 18:01:06) to Date object
 */
function parseTOSDateTime(dateStr: string, sourceTimezone: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const trimmed = dateStr.trim();
  // Match format: MM/DD/YY HH:MM:SS
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  
  const [, month, day, year, hour, minute, second] = match;
  // Assume 2000s for 2-digit year
  const fullYear = 2000 + parseInt(year);
  
  // Create date in source timezone, then convert to UTC for storage
  const localDateStr = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
  
  try {
    // Convert from source timezone to UTC
    const utcDate = fromZonedTime(localDateStr, sourceTimezone);
    return utcDate;
  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
    return null;
  }
}

/**
 * Parse TOS date format (12/30/25) without time
 */
function parseTOSDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!match) return null;
  
  const [, month, day, year] = match;
  const fullYear = 2000 + parseInt(year);
  
  return new Date(fullYear, parseInt(month) - 1, parseInt(day));
}

/**
 * Find a section in the multi-section CSV
 */
function findSection(lines: string[], sectionName: string): { startLine: number; endLine: number; headers: string[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(sectionName)) {
      // Found section header, next line should be column headers
      if (i + 1 >= lines.length) return null;
      
      const headers = parseCSVLine(lines[i + 1]);
      
      // Find end of section (blank line or next section)
      let endLine = lines.length;
      for (let j = i + 2; j < lines.length; j++) {
        const testLine = lines[j].trim();
        if (testLine === '' || 
            testLine.startsWith('Total') ||
            testLine.startsWith('TOTAL') ||
            testLine.startsWith('OVERALL') ||
            // Check for section headers (no comma at start, looks like a title)
            (testLine.length > 0 && !testLine.startsWith(',') && testLine.split(',').length <= 2 && !testLine.match(/^\d/))) {
          // Check if this is actually a new section
          if (!testLine.match(/^\d/) && testLine.length > 5 && testLine.split(',').length <= 2) {
            endLine = j;
            break;
          }
          if (testLine === '' || testLine.startsWith('TOTAL') || testLine.startsWith('OVERALL')) {
            endLine = j;
            break;
          }
        }
      }
      
      return { startLine: i + 2, endLine, headers };
    }
  }
  return null;
}

/**
 * Parse Cash Balance section for fees
 */
function parseCashBalanceSection(lines: string[], sectionInfo: { startLine: number; endLine: number; headers: string[] }, sourceTimezone: string): FeeRecord[] {
  const fees: FeeRecord[] = [];
  const { startLine, endLine, headers } = sectionInfo;
  
  // Find column indices
  const dateIdx = headers.findIndex(h => h.toUpperCase() === 'DATE');
  const timeIdx = headers.findIndex(h => h.toUpperCase() === 'TIME');
  const typeIdx = headers.findIndex(h => h.toUpperCase() === 'TYPE');
  const refIdx = headers.findIndex(h => h.toUpperCase().includes('REF'));
  const descIdx = headers.findIndex(h => h.toUpperCase() === 'DESCRIPTION');
  const miscFeesIdx = headers.findIndex(h => h.toUpperCase().includes('MISC'));
  const commissionsIdx = headers.findIndex(h => h.toUpperCase().includes('COMMISSION'));
  const amountIdx = headers.findIndex(h => h.toUpperCase() === 'AMOUNT');
  
  for (let i = startLine; i < endLine; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 4) continue;
    
    const type = row[typeIdx]?.trim() || '';
    // Only look at TRD (trade) entries which have fees
    if (type !== 'TRD') continue;
    
    const dateStr = row[dateIdx]?.trim() || '';
    const timeStr = row[timeIdx]?.trim() || '';
    const fullDateStr = `${dateStr} ${timeStr}`;
    const date = parseTOSDateTime(fullDateStr, sourceTimezone);
    if (!date) continue;
    
    const refNumber = (row[refIdx] || '').replace(/[="]/g, '').trim();
    const description = row[descIdx]?.trim() || '';
    const miscFees = Math.abs(parseNumber(row[miscFeesIdx] || '0'));
    const commissions = Math.abs(parseNumber(row[commissionsIdx] || '0'));
    const amount = parseNumber(row[amountIdx] || '0');
    
    if (miscFees > 0 || commissions > 0) {
      fees.push({
        date,
        refNumber,
        description,
        miscFees,
        commissions,
        amount,
      });
    }
  }
  
  return fees;
}

/**
 * Parse Account Trade History section
 */
function parseTradeHistorySection(
  lines: string[], 
  sectionInfo: { startLine: number; endLine: number; headers: string[] },
  sourceTimezone: string
): { executions: Execution[]; warnings: string[] } {
  const executions: Execution[] = [];
  const warnings: string[] = [];
  const { startLine, endLine, headers } = sectionInfo;
  
  // Find column indices - TOS has an empty first column sometimes
  const findIdx = (name: string) => {
    const idx = headers.findIndex(h => h.toUpperCase().includes(name.toUpperCase()));
    return idx;
  };
  
  const execTimeIdx = findIdx('Exec Time');
  const spreadIdx = findIdx('Spread');
  const sideIdx = findIdx('Side');
  const qtyIdx = findIdx('Qty');
  const posEffectIdx = findIdx('Pos Effect');
  const symbolIdx = findIdx('Symbol');
  const priceIdx = headers.findIndex(h => h.toUpperCase() === 'PRICE');
  const netPriceIdx = findIdx('Net Price');
  const orderTypeIdx = findIdx('Order Type');
  
  for (let i = startLine; i < endLine; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 6) continue;
    
    // Skip total/summary rows
    const firstNonEmpty = row.find(c => c.trim() !== '');
    if (firstNonEmpty?.toUpperCase().includes('TOTAL')) continue;
    
    const execTimeStr = row[execTimeIdx]?.trim() || '';
    const execTime = parseTOSDateTime(execTimeStr, sourceTimezone);
    if (!execTime) {
      if (execTimeStr && !execTimeStr.toUpperCase().includes('TOTAL')) {
        warnings.push(`Could not parse exec time: ${execTimeStr}`);
      }
      continue;
    }
    
    const spread = row[spreadIdx]?.trim() || '';
    // Only handle STOCK for now
    if (spread.toUpperCase() !== 'STOCK') {
      warnings.push(`Skipping non-stock execution: ${spread} for ${row[symbolIdx]}`);
      continue;
    }
    
    const sideStr = row[sideIdx]?.trim().toUpperCase() || '';
    const side = sideStr === 'BUY' ? 'BUY' : 'SELL';
    
    const qtyParsed = parseQuantity(row[qtyIdx] || '0');
    const qty = qtyParsed.qty;
    if (qty === 0) continue;
    
    const posEffectStr = row[posEffectIdx]?.trim().toUpperCase() || '';
    const posEffect = posEffectStr.includes('OPEN') ? 'TO OPEN' : 'TO CLOSE';
    
    const symbol = row[symbolIdx]?.trim().toUpperCase() || '';
    if (!symbol) continue;
    
    const price = parseNumber(row[priceIdx] || '0');
    const netPrice = parseNumber(row[netPriceIdx] || '0') || price;
    const orderType = row[orderTypeIdx]?.trim() || '';
    
    executions.push({
      execTime,
      spread,
      side,
      qty,
      posEffect,
      symbol,
      price,
      netPrice,
      orderType,
    });
  }
  
  return { executions, warnings };
}

/**
 * Match executions to create complete trades using FIFO
 */
function matchExecutionsToTrades(
  executions: Execution[],
  fees: FeeRecord[]
): { trades: ReconstructedTrade[]; unmatchedOpens: { symbol: string; side: 'LONG' | 'SHORT'; qty: number; avgPrice: number }[] } {
  // Group executions by symbol
  const bySymbol = new Map<string, Execution[]>();
  for (const exec of executions) {
    if (!bySymbol.has(exec.symbol)) {
      bySymbol.set(exec.symbol, []);
    }
    bySymbol.get(exec.symbol)!.push(exec);
  }
  
  const trades: ReconstructedTrade[] = [];
  const unmatchedOpens: { symbol: string; side: 'LONG' | 'SHORT'; qty: number; avgPrice: number }[] = [];
  
  for (const [symbol, symbolExecs] of bySymbol) {
    // Sort by execution time
    symbolExecs.sort((a, b) => a.execTime.getTime() - b.execTime.getTime());
    
    // Track open positions by direction (LONG or SHORT)
    const longOpens: OpenPosition[] = [];
    const shortOpens: OpenPosition[] = [];
    
    for (const exec of symbolExecs) {
      // Determine if this is opening or closing
      if (exec.posEffect === 'TO OPEN') {
        // BUY TO OPEN = Long entry
        // SELL TO OPEN = Short entry
        const positions = exec.side === 'BUY' ? longOpens : shortOpens;
        positions.push({
          execTime: exec.execTime,
          qty: exec.qty,
          price: exec.price,
          refNumber: exec.refNumber,
        });
      } else {
        // TO CLOSE - match against opposite opens
        // BUY TO CLOSE = Closing a Short
        // SELL TO CLOSE = Closing a Long
        const positions = exec.side === 'BUY' ? shortOpens : longOpens;
        const tradeSide = exec.side === 'BUY' ? 'SHORT' : 'LONG';
        
        let remainingQty = exec.qty;
        
        while (remainingQty > 0 && positions.length > 0) {
          const openPos = positions[0];
          const matchQty = Math.min(remainingQty, openPos.qty);
          
          // Create a trade for this match
          const entryDatetime = openPos.execTime.toISOString();
          const exitDatetime = exec.execTime.toISOString();
          const entryPrice = openPos.price;
          const exitPrice = exec.price;
          
          // Calculate P/L
          let grossPnL: number;
          if (tradeSide === 'LONG') {
            grossPnL = (exitPrice - entryPrice) * matchQty;
          } else {
            grossPnL = (entryPrice - exitPrice) * matchQty;
          }
          
          // Try to find fees for this trade
          // Look for fee records that match by timestamp proximity
          let tradeFees = 0;
          let tradeCommissions = 0;
          // Simple approximation - distribute fees proportionally
          // (A more accurate approach would match by ref number)
          
          const duration = (exec.execTime.getTime() - openPos.execTime.getTime()) / (1000 * 60);
          
          const stableHash = generateStableHash(
            symbol,
            tradeSide,
            entryDatetime,
            exitDatetime,
            entryPrice,
            exitPrice,
            matchQty,
            null
          );
          
          trades.push({
            symbol,
            side: tradeSide,
            entryDatetime,
            exitDatetime,
            entryPrice,
            exitPrice,
            quantity: matchQty,
            fees: tradeFees,
            commissions: tradeCommissions,
            grossPnL,
            netPnL: grossPnL - tradeFees - tradeCommissions,
            duration,
            stableHash,
          });
          
          remainingQty -= matchQty;
          openPos.qty -= matchQty;
          
          if (openPos.qty <= 0) {
            positions.shift();
          }
        }
      }
    }
    
    // Report unmatched opens
    if (longOpens.length > 0) {
      const totalQty = longOpens.reduce((sum, p) => sum + p.qty, 0);
      const avgPrice = longOpens.reduce((sum, p) => sum + p.price * p.qty, 0) / totalQty;
      unmatchedOpens.push({ symbol, side: 'LONG', qty: totalQty, avgPrice });
    }
    if (shortOpens.length > 0) {
      const totalQty = shortOpens.reduce((sum, p) => sum + p.qty, 0);
      const avgPrice = shortOpens.reduce((sum, p) => sum + p.price * p.qty, 0) / totalQty;
      unmatchedOpens.push({ symbol, side: 'SHORT', qty: totalQty, avgPrice });
    }
  }
  
  // Try to allocate fees to trades
  // Strategy: Match fees by ref number in description if possible, otherwise distribute proportionally
  if (fees.length > 0 && trades.length > 0) {
    // For simplicity, distribute fees proportionally by trade value
    const totalTradeValue = trades.reduce((sum, t) => sum + t.entryPrice * t.quantity, 0);
    const totalFees = fees.reduce((sum, f) => sum + f.miscFees, 0);
    const totalCommissions = fees.reduce((sum, f) => sum + f.commissions, 0);
    
    if (totalTradeValue > 0) {
      for (const trade of trades) {
        const tradeValue = trade.entryPrice * trade.quantity;
        const proportion = tradeValue / totalTradeValue;
        trade.fees = totalFees * proportion;
        trade.commissions = totalCommissions * proportion;
        trade.netPnL = trade.grossPnL - trade.fees - trade.commissions;
      }
    }
  }
  
  // Sort trades by entry time
  trades.sort((a, b) => new Date(a.entryDatetime).getTime() - new Date(b.entryDatetime).getTime());
  
  return { trades, unmatchedOpens };
}

/**
 * Main parser function for TOS Account Statement CSV
 */
export function parseTOSAccountStatement(csvText: string, sourceTimezone: string = 'America/Chicago'): TOSParseResult {
  const result: TOSParseResult = {
    executions: [],
    fees: [],
    completedTrades: [],
    unmatchedOpens: [],
    warnings: [],
    errors: [],
  };
  
  try {
    const cleanedText = cleanText(csvText);
    const lines = cleanedText.split(/\r?\n/);
    
    // Parse Account Trade History section
    const tradeHistorySection = findSection(lines, 'Account Trade History');
    if (!tradeHistorySection) {
      result.errors.push('Could not find "Account Trade History" section in the file');
      return result;
    }
    
    const { executions, warnings } = parseTradeHistorySection(lines, tradeHistorySection, sourceTimezone);
    result.executions = executions;
    result.warnings.push(...warnings);
    
    if (executions.length === 0) {
      result.warnings.push('No stock executions found in Account Trade History section');
      return result;
    }
    
    // Parse Cash Balance section for fees (optional)
    const cashBalanceSection = findSection(lines, 'Cash Balance');
    if (cashBalanceSection) {
      result.fees = parseCashBalanceSection(lines, cashBalanceSection, sourceTimezone);
    } else {
      result.warnings.push('Cash Balance section not found - fees will not be imported');
    }
    
    // Match executions to create trades
    const { trades, unmatchedOpens } = matchExecutionsToTrades(result.executions, result.fees);
    result.completedTrades = trades;
    result.unmatchedOpens = unmatchedOpens;
    
    if (unmatchedOpens.length > 0) {
      const opensList = unmatchedOpens.map(o => `${o.symbol} (${o.side}: ${o.qty} @ $${o.avgPrice.toFixed(2)})`).join(', ');
      result.warnings.push(`Open positions not imported: ${opensList}`);
    }
    
  } catch (error: any) {
    result.errors.push(`Parse error: ${error.message}`);
  }
  
  return result;
}
