import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, ChevronRight, Loader2, Clock, AlertTriangle, Info } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateStableHash } from '@/lib/calculations';
import { parseTOSAccountStatement, TIMEZONE_OPTIONS, ReconstructedTrade, TOSParseResult } from '@/lib/tosAccountStatementParser';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';
type ImportSource = 'ThinkOrSwim' | 'ThinkOrSwim-AccountStatement' | 'TraderVue' | 'Custom';

interface ColumnMapping {
  symbol: string;
  side: string;
  entry_datetime: string;
  exit_datetime: string;
  entry_price: string;
  exit_price: string;
  quantity: string;
  fees?: string;
  commissions?: string;
  stop_loss?: string;
  notes?: string;
  mfe?: string;
  mae?: string;
  tags?: string;
  gross_pnl?: string;
  net_pnl?: string;
}

interface ParsedTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_datetime: string;
  exit_datetime: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  fees: number;
  commissions: number;
  stop_loss: number | null;
  notes: string | null;
  mfe: number | null;
  mae: number | null;
  stable_hash: string;
  isDuplicate?: boolean;
  calculated_exit_price?: number | null;
  grossPnL?: number;
  netPnL?: number;
  duration?: number;
}

const defaultMappings: Record<Exclude<ImportSource, 'ThinkOrSwim-AccountStatement'>, ColumnMapping> = {
  ThinkOrSwim: {
    symbol: 'Symbol',
    side: 'Side',
    entry_datetime: 'Open Date/Time',
    exit_datetime: 'Close Date/Time',
    entry_price: 'Open Price',
    exit_price: 'Close Price',
    quantity: 'Qty',
    fees: 'Fees',
    commissions: 'Commission',
  },
  TraderVue: {
    symbol: 'Symbol',
    side: 'Side',
    entry_datetime: 'Open Datetime',
    exit_datetime: 'Close Datetime',
    entry_price: 'Entry Price',
    exit_price: 'Exit Price',
    quantity: 'Volume',
    fees: 'Fees',
    commissions: 'Commissions',
    mfe: 'Position MFE',
    mae: 'Position MAE',
    notes: 'Notes',
    tags: 'Tags',
    gross_pnl: 'Gross P&L',
    net_pnl: 'Net P&L',
  },
  Custom: {
    symbol: '',
    side: '',
    entry_datetime: '',
    exit_datetime: '',
    entry_price: '',
    exit_price: '',
    quantity: '',
  },
};

export default function Import() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState<ImportStep>('upload');
  const [source, setSource] = useState<ImportSource>('Custom');
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(defaultMappings.Custom);
  const [parsedTrades, setParsedTrades] = useState<ParsedTrade[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; new: number; skipped: number } | null>(null);
  
  // TOS Account Statement specific state
  const [sourceTimezone, setSourceTimezone] = useState('America/Chicago');
  const [tosParseResult, setTosParseResult] = useState<TOSParseResult | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string>('');

  const parseCSVLine = (line: string): string[] => {
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
      } else if (char !== '\r') { // Skip carriage return
        currentField += char;
      }
    }
    result.push(currentField.trim());
    return result;
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Please select a CSV file to upload',
      });
      return;
    }

    // Validate file type
    if (!uploadedFile.name.toLowerCase().endsWith('.csv') && uploadedFile.type !== 'text/csv') {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a CSV file',
      });
      return;
    }

    setFile(uploadedFile);
    
    const reader = new FileReader();
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'Failed to read file',
        description: 'There was an error reading your file. Please try again.',
      });
    };
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || text.trim().length === 0) {
          toast({
            variant: 'destructive',
            title: 'Empty file',
            description: 'The uploaded file appears to be empty',
          });
          return;
        }

        // Store raw text for TOS Account Statement parsing
        setRawCsvText(text);

        // For TOS Account Statement, skip standard CSV parsing
        if (source === 'ThinkOrSwim-AccountStatement') {
          // Parse TOS format
          const result = parseTOSAccountStatement(text, sourceTimezone);
          setTosParseResult(result);
          
          if (result.errors.length > 0) {
            toast({
              variant: 'destructive',
              title: 'Parse Error',
              description: result.errors[0],
            });
            return;
          }
          
          // Convert to ParsedTrade format and check for duplicates
          checkTOSDuplicatesAndProceed(result);
          return;
        }

        // Split by newlines (handle both Windows and Unix line endings)
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        if (lines.length < 2) {
          toast({
            variant: 'destructive',
            title: 'Invalid CSV',
            description: 'The file must have at least a header row and one data row',
          });
          return;
        }

        const rows = lines.map(parseCSVLine);
        const headerRow = rows[0];
        const dataRows = rows.slice(1);

        setHeaders(headerRow);
        setCsvData(dataRows);
        setMapping(defaultMappings[source as Exclude<ImportSource, 'ThinkOrSwim-AccountStatement'>] || defaultMappings.Custom);
        setStep('mapping');
        
        toast({
          title: 'File loaded',
          description: `Found ${dataRows.length} rows to import`,
        });
      } catch (error) {
        console.error('CSV parsing error:', error);
        toast({
          variant: 'destructive',
          title: 'Failed to parse CSV',
          description: 'There was an error parsing your file. Please check the format.',
        });
      }
    };
    reader.readAsText(uploadedFile);
  }, [source, sourceTimezone, toast]);

  const checkTOSDuplicatesAndProceed = async (result: TOSParseResult) => {
    // Convert to ParsedTrade format
    const trades: ParsedTrade[] = result.completedTrades.map(t => ({
      symbol: t.symbol,
      side: t.side,
      entry_datetime: t.entryDatetime,
      exit_datetime: t.exitDatetime,
      entry_price: t.entryPrice,
      exit_price: t.exitPrice,
      quantity: t.quantity,
      fees: t.fees,
      commissions: t.commissions,
      stop_loss: null,
      notes: null,
      mfe: null,
      mae: null,
      stable_hash: t.stableHash,
      grossPnL: t.grossPnL,
      netPnL: t.netPnL,
      duration: t.duration,
    }));

    // Check for duplicates
    const { data: existingTrades } = await supabase
      .from('trades')
      .select('stable_hash')
      .eq('user_id', user?.id);

    const existingHashes = new Set((existingTrades || []).map(t => t.stable_hash));
    
    trades.forEach(trade => {
      trade.isDuplicate = existingHashes.has(trade.stable_hash);
    });

    setParsedTrades(trades);
    setStep('preview');
    
    toast({
      title: 'File parsed successfully',
      description: `Found ${result.executions.length} executions, reconstructed ${trades.length} trades`,
    });
  };

  const handleSourceChange = (newSource: ImportSource) => {
    setSource(newSource);
    if (newSource !== 'ThinkOrSwim-AccountStatement') {
      setMapping(defaultMappings[newSource as Exclude<ImportSource, 'ThinkOrSwim-AccountStatement'>] || defaultMappings.Custom);
    }
    // Reset file when changing source
    setFile(null);
    setCsvData([]);
    setHeaders([]);
    setParsedTrades([]);
    setTosParseResult(null);
  };

  const handleTimezoneChange = (tz: string) => {
    setSourceTimezone(tz);
    // Re-parse if we have raw CSV text
    if (rawCsvText && source === 'ThinkOrSwim-AccountStatement') {
      const result = parseTOSAccountStatement(rawCsvText, tz);
      setTosParseResult(result);
      if (result.errors.length === 0) {
        checkTOSDuplicatesAndProceed(result);
      }
    }
  };

  const parseTrades = async () => {
    const trades: ParsedTrade[] = [];
    
    const getColIndex = (field: string) => headers.indexOf(field);
    
    for (const row of csvData) {
      try {
        const symbolIdx = getColIndex(mapping.symbol);
        const sideIdx = getColIndex(mapping.side);
        const entryDateIdx = getColIndex(mapping.entry_datetime);
        const exitDateIdx = getColIndex(mapping.exit_datetime);
        const entryPriceIdx = getColIndex(mapping.entry_price);
        const exitPriceIdx = getColIndex(mapping.exit_price);
        const qtyIdx = getColIndex(mapping.quantity);
        const feesIdx = mapping.fees ? getColIndex(mapping.fees) : -1;
        const commissionsIdx = mapping.commissions ? getColIndex(mapping.commissions) : -1;
        const mfeIdx = mapping.mfe ? getColIndex(mapping.mfe) : -1;
        const maeIdx = mapping.mae ? getColIndex(mapping.mae) : -1;
        const notesIdx = mapping.notes ? getColIndex(mapping.notes) : -1;
        const grossPnlIdx = mapping.gross_pnl ? getColIndex(mapping.gross_pnl) : -1;
        const netPnlIdx = mapping.net_pnl ? getColIndex(mapping.net_pnl) : -1;

        if (symbolIdx === -1 || entryPriceIdx === -1 || qtyIdx === -1) continue;

        const symbol = row[symbolIdx]?.toUpperCase();
        if (!symbol) continue;

        const rawSide = row[sideIdx]?.toUpperCase() || 'L';
        // Handle TraderVue format: 'L' = LONG, 'S' = SHORT
        const side = (rawSide === 'S' || rawSide.includes('SHORT') || rawSide.includes('SELL')) ? 'SHORT' : 'LONG';
        
        const entryDatetime = row[entryDateIdx] ? new Date(row[entryDateIdx]).toISOString() : new Date().toISOString();
        const exitDatetime = exitDateIdx >= 0 && row[exitDateIdx] ? new Date(row[exitDateIdx]).toISOString() : null;
        
        const entryPrice = parseFloat(row[entryPriceIdx]?.replace(/[$,]/g, '') || '0');
        let exitPrice = exitPriceIdx >= 0 && row[exitPriceIdx] ? parseFloat(row[exitPriceIdx]?.replace(/[$,]/g, '') || '0') : null;
        
        // TraderVue reports total volume (entry + exit), so divide by 2 for actual position size
        const rawQuantity = Math.abs(parseFloat(row[qtyIdx]?.replace(/[,]/g, '') || '0'));
        const quantity = source === 'TraderVue' ? rawQuantity / 2 : rawQuantity;
        const fees = feesIdx >= 0 ? parseFloat(row[feesIdx]?.replace(/[$,]/g, '') || '0') : 0;
        const commissions = commissionsIdx >= 0 ? parseFloat(row[commissionsIdx]?.replace(/[$,]/g, '') || '0') : 0;
        const mfe = mfeIdx >= 0 && row[mfeIdx] ? parseFloat(row[mfeIdx]?.replace(/[$,]/g, '') || '0') : null;
        const mae = maeIdx >= 0 && row[maeIdx] ? parseFloat(row[maeIdx]?.replace(/[$,]/g, '') || '0') : null;
        const notes = notesIdx >= 0 && row[notesIdx] ? row[notesIdx] : null;
        
        // Parse P/L from TraderVue - prefer Gross P&L for calculating exit price
        const grossPnl = grossPnlIdx >= 0 && row[grossPnlIdx] ? parseFloat(row[grossPnlIdx]?.replace(/[$,()]/g, '').replace(/^\((.+)\)$/, '-$1') || '0') : null;
        const netPnl = netPnlIdx >= 0 && row[netPnlIdx] ? parseFloat(row[netPnlIdx]?.replace(/[$,()]/g, '').replace(/^\((.+)\)$/, '-$1') || '0') : null;

        if (!entryPrice || !quantity) continue;

        // If we have Gross P/L from TraderVue, calculate the accurate exit price
        // Gross P/L = (exit_price - entry_price) * quantity for LONG
        // Gross P/L = (entry_price - exit_price) * quantity for SHORT
        let calculatedExitPrice: number | null = null;
        if (source === 'TraderVue' && grossPnl !== null && quantity > 0) {
          if (side === 'LONG') {
            // For LONG: grossPnl = (exit - entry) * qty => exit = (grossPnl / qty) + entry
            calculatedExitPrice = (grossPnl / quantity) + entryPrice;
          } else {
            // For SHORT: grossPnl = (entry - exit) * qty => exit = entry - (grossPnl / qty)
            calculatedExitPrice = entryPrice - (grossPnl / quantity);
          }
          // Use calculated exit price if we have Gross P/L
          exitPrice = calculatedExitPrice;
        }

        const stableHash = generateStableHash(symbol, side, entryDatetime, exitDatetime, entryPrice, exitPrice, quantity, null);

        trades.push({
          symbol,
          side,
          entry_datetime: entryDatetime,
          exit_datetime: exitDatetime,
          entry_price: entryPrice,
          exit_price: exitPrice,
          quantity,
          fees: Math.abs(fees),
          commissions: Math.abs(commissions),
          stop_loss: null,
          notes,
          mfe,
          mae,
          stable_hash: stableHash,
          calculated_exit_price: calculatedExitPrice,
        });
      } catch (err) {
        console.error('Error parsing row:', err, row);
      }
    }

    // Check for duplicates
    const { data: existingTrades } = await supabase
      .from('trades')
      .select('stable_hash')
      .eq('user_id', user?.id);

    const existingHashes = new Set((existingTrades || []).map(t => t.stable_hash));
    
    trades.forEach(trade => {
      trade.isDuplicate = existingHashes.has(trade.stable_hash);
    });

    setParsedTrades(trades);
    setStep('preview');
  };

  const handleImport = async () => {
    setImporting(true);
    
    try {
      const newTrades = parsedTrades.filter(t => !t.isDuplicate);
      let actuallyImported = 0;
      
      if (newTrades.length > 0) {
        const tradesToInsert = newTrades.map(t => ({
          user_id: user?.id,
          symbol: t.symbol,
          side: t.side,
          entry_datetime: t.entry_datetime,
          exit_datetime: t.exit_datetime,
          entry_price: t.entry_price,
          exit_price: t.exit_price,
          quantity: t.quantity,
          fees: t.fees,
          commissions: t.commissions,
          stop_loss: t.stop_loss,
          notes: t.notes,
          mfe: t.mfe,
          mae: t.mae,
          stable_hash: t.stable_hash,
          source: source === 'ThinkOrSwim-AccountStatement' ? 'ThinkOrSwim' : source,
        }));

        // Use upsert with onConflict to skip duplicates gracefully
        const { data, error } = await supabase
          .from('trades')
          .upsert(tradesToInsert, { 
            onConflict: 'user_id,stable_hash',
            ignoreDuplicates: true 
          })
          .select('id');
        
        if (error) throw error;
        actuallyImported = data?.length || 0;
      }

      // Log the import - use 'ThinkOrSwim' for account statement imports
      const sourceToLog = source === 'ThinkOrSwim-AccountStatement' ? 'ThinkOrSwim' : source;
      await supabase.from('imports').insert({
        user_id: user?.id,
        source_name: sourceToLog as 'ThinkOrSwim' | 'TraderVue' | 'Custom',
        filename: file?.name || 'unknown',
        rows_total: parsedTrades.length,
        rows_new: actuallyImported,
        rows_skipped: parsedTrades.length - actuallyImported,
      });

      setImportResult({
        total: parsedTrades.length,
        new: actuallyImported,
        skipped: parsedTrades.length - actuallyImported,
      });
      setStep('complete');

      toast({
        title: 'Import complete',
        description: `${actuallyImported} trades imported successfully`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: error.message,
      });
    } finally {
      setImporting(false);
    }
  };

  const formatDuration = (minutes: number | undefined): string => {
    if (!minutes) return '-';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hrs`;
    return `${(minutes / 1440).toFixed(1)} days`;
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Trades</h1>
          <p className="text-muted-foreground">Upload your trade history from a CSV file</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between">
          {['upload', 'mapping', 'preview', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                step === s ? 'bg-primary text-primary-foreground' :
                ['mapping', 'preview', 'complete'].indexOf(step) > i ? 'bg-primary/20 text-primary' :
                'bg-muted text-muted-foreground'
              )}>
                {i + 1}
              </div>
              {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-2" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
              <CardDescription>Select your broker/platform and upload your trade history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Import Source</Label>
                <Select value={source} onValueChange={(v) => handleSourceChange(v as ImportSource)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ThinkOrSwim">ThinkOrSwim (Trade Log)</SelectItem>
                    <SelectItem value="ThinkOrSwim-AccountStatement">ThinkOrSwim (Account Statement CSV)</SelectItem>
                    <SelectItem value="TraderVue">TraderVue</SelectItem>
                    <SelectItem value="Custom">Custom CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* TOS Account Statement specific options */}
              {source === 'ThinkOrSwim-AccountStatement' && (
                <div className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Account Statement Import</AlertTitle>
                    <AlertDescription>
                      This parser reads the multi-section "Account Statement" CSV from TOS. 
                      It will extract executions from the "Account Trade History" section and 
                      reconstruct complete trades using FIFO matching.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Source Timezone (your local time)
                    </Label>
                    <Select value={sourceTimezone} onValueChange={setSourceTimezone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map(tz => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      TOS exports timestamps in your local timezone. Select your timezone to convert to market time (US Eastern).
                    </p>
                  </div>
                </div>
              )}

              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".csv,text/csv,application/csv,application/vnd.ms-excel"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer block">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Click to select your CSV file</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports .csv files from most brokers</p>
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'mapping' && source !== 'ThinkOrSwim-AccountStatement' && (
          <Card>
            <CardHeader>
              <CardTitle>Map Columns</CardTitle>
              <CardDescription>Match your CSV columns to trade fields. File: {file?.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries({
                  symbol: 'Symbol *',
                  side: 'Side *',
                  entry_datetime: 'Entry Date/Time *',
                  exit_datetime: 'Exit Date/Time',
                  entry_price: 'Entry Price *',
                  exit_price: 'Exit Price',
                  quantity: 'Quantity *',
                  fees: 'Fees',
                  commissions: 'Commissions',
                  gross_pnl: 'Gross P&L',
                  net_pnl: 'Net P&L',
                  mfe: 'MFE (Position)',
                  mae: 'MAE (Position)',
                  notes: 'Notes',
                }).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Select 
                      value={(mapping as any)[key] || '__none__'} 
                      onValueChange={(v) => setMapping({ ...mapping, [key]: v === '__none__' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Not mapped --</SelectItem>
                        {headers.map((h, idx) => (
                          <SelectItem key={`${h}-${idx}`} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                <Button onClick={parseTrades}>Preview Import</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Import</CardTitle>
              <CardDescription>
                {parsedTrades.filter(t => !t.isDuplicate).length} new trades will be imported, 
                {' '}{parsedTrades.filter(t => t.isDuplicate).length} duplicates will be skipped
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* TOS specific warnings */}
              {source === 'ThinkOrSwim-AccountStatement' && tosParseResult && (
                <div className="space-y-3">
                  {/* Stats summary */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {tosParseResult.executions.length} executions parsed
                    </Badge>
                    <Badge variant="secondary">
                      {tosParseResult.completedTrades.length} complete trades
                    </Badge>
                    {tosParseResult.fees.length > 0 && (
                      <Badge variant="secondary">
                        {tosParseResult.fees.length} fee records
                      </Badge>
                    )}
                  </div>

                  {/* Warnings */}
                  {tosParseResult.warnings.length > 0 && (
                    <Alert variant="default">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Warnings</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc list-inside text-sm space-y-1 mt-1">
                          {tosParseResult.warnings.slice(0, 5).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                          {tosParseResult.warnings.length > 5 && (
                            <li>... and {tosParseResult.warnings.length - 5} more</li>
                          )}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Unmatched opens */}
                  {tosParseResult.unmatchedOpens.length > 0 && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Open Positions (not imported)</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc list-inside text-sm space-y-1 mt-1">
                          {tosParseResult.unmatchedOpens.map((o, i) => (
                            <li key={i}>
                              {o.symbol} - {o.side}: {o.qty} shares @ ${o.avgPrice.toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Symbol</th>
                      <th className="text-left p-2">Side</th>
                      <th className="text-right p-2">Entry</th>
                      <th className="text-right p-2">Exit</th>
                      <th className="text-right p-2">Qty</th>
                      {source === 'ThinkOrSwim-AccountStatement' && (
                        <>
                          <th className="text-right p-2">P/L</th>
                          <th className="text-right p-2">Duration</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTrades.slice(0, 50).map((trade, i) => (
                      <tr key={i} className={cn(
                        'border-b',
                        trade.isDuplicate && 'opacity-50 bg-muted/30'
                      )}>
                        <td className="p-2">
                          {trade.isDuplicate ? (
                            <AlertCircle className="h-4 w-4 text-warning" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-profit" />
                          )}
                        </td>
                        <td className="p-2 font-medium">{trade.symbol}</td>
                        <td className="p-2">
                          <Badge variant={trade.side === 'LONG' ? 'default' : 'secondary'}>
                            {trade.side}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-mono">${trade.entry_price.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono">{trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}</td>
                        <td className="p-2 text-right font-mono">{trade.quantity}</td>
                        {source === 'ThinkOrSwim-AccountStatement' && (
                          <>
                            <td className={cn(
                              'p-2 text-right font-mono',
                              trade.netPnL && trade.netPnL > 0 ? 'text-profit' : 'text-loss'
                            )}>
                              {trade.netPnL ? `$${trade.netPnL.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2 text-right text-muted-foreground">
                              {formatDuration(trade.duration)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedTrades.length > 50 && (
                  <p className="text-center text-sm text-muted-foreground py-2">
                    ... and {parsedTrades.length - 50} more trades
                  </p>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                <Button onClick={handleImport} disabled={importing || parsedTrades.filter(t => !t.isDuplicate).length === 0}>
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import {parsedTrades.filter(t => !t.isDuplicate).length} Trades
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'complete' && importResult && (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="mx-auto h-16 w-16 text-profit mb-4" />
              <h2 className="text-2xl font-bold mb-2">Import Complete!</h2>
              <div className="text-muted-foreground space-y-1 mb-6">
                <p>{importResult.new} trades imported successfully</p>
                {importResult.skipped > 0 && (
                  <p>{importResult.skipped} duplicates skipped</p>
                )}
              </div>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setCsvData([]);
                  setParsedTrades([]);
                  setTosParseResult(null);
                  setRawCsvText('');
                }}>
                  Import More
                </Button>
                <Button onClick={() => navigate('/trades')}>
                  View Trades
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
