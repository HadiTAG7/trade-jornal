import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, ChevronRight, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateStableHash } from '@/lib/calculations';
import { cn } from '@/lib/utils';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';
type ImportSource = 'ThinkOrSwim' | 'TraderVue' | 'Custom';

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
  stable_hash: string;
  isDuplicate?: boolean;
}

const defaultMappings: Record<ImportSource, ColumnMapping> = {
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
    entry_datetime: 'Entry Time',
    exit_datetime: 'Exit Time',
    entry_price: 'Entry Price',
    exit_price: 'Exit Price',
    quantity: 'Shares',
    fees: 'SEC Fees',
    commissions: 'Commissions',
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

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split('\n').map(row => {
        // Handle quoted CSV fields properly
        const result: string[] = [];
        let inQuotes = false;
        let currentField = '';
        
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(currentField.trim());
            currentField = '';
          } else {
            currentField += char;
          }
        }
        result.push(currentField.trim());
        return result;
      }).filter(row => row.some(cell => cell.length > 0));

      if (rows.length > 0) {
        setHeaders(rows[0]);
        setCsvData(rows.slice(1));
        setMapping(defaultMappings[source]);
        setStep('mapping');
      }
    };
    reader.readAsText(uploadedFile);
  }, [source]);

  const handleSourceChange = (newSource: ImportSource) => {
    setSource(newSource);
    setMapping(defaultMappings[newSource]);
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

        if (symbolIdx === -1 || entryPriceIdx === -1 || qtyIdx === -1) continue;

        const symbol = row[symbolIdx]?.toUpperCase();
        if (!symbol) continue;

        const rawSide = row[sideIdx]?.toUpperCase() || 'LONG';
        const side = rawSide.includes('SHORT') || rawSide.includes('SELL') ? 'SHORT' : 'LONG';
        
        const entryDatetime = row[entryDateIdx] ? new Date(row[entryDateIdx]).toISOString() : new Date().toISOString();
        const exitDatetime = exitDateIdx >= 0 && row[exitDateIdx] ? new Date(row[exitDateIdx]).toISOString() : null;
        
        const entryPrice = parseFloat(row[entryPriceIdx]?.replace(/[$,]/g, '') || '0');
        const exitPrice = exitPriceIdx >= 0 ? parseFloat(row[exitPriceIdx]?.replace(/[$,]/g, '') || '0') : null;
        const quantity = Math.abs(parseFloat(row[qtyIdx]?.replace(/[,]/g, '') || '0'));
        const fees = feesIdx >= 0 ? parseFloat(row[feesIdx]?.replace(/[$,]/g, '') || '0') : 0;
        const commissions = commissionsIdx >= 0 ? parseFloat(row[commissionsIdx]?.replace(/[$,]/g, '') || '0') : 0;

        if (!entryPrice || !quantity) continue;

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
          notes: null,
          stable_hash: stableHash,
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
          stable_hash: t.stable_hash,
          source: source,
        }));

        const { error } = await supabase.from('trades').insert(tradesToInsert);
        if (error) throw error;
      }

      // Log the import
      await supabase.from('imports').insert({
        user_id: user?.id,
        source_name: source,
        filename: file?.name || 'unknown',
        rows_total: parsedTrades.length,
        rows_new: newTrades.length,
        rows_skipped: parsedTrades.length - newTrades.length,
      });

      setImportResult({
        total: parsedTrades.length,
        new: newTrades.length,
        skipped: parsedTrades.length - newTrades.length,
      });
      setStep('complete');

      toast({
        title: 'Import complete',
        description: `${newTrades.length} trades imported successfully`,
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
                    <SelectItem value="ThinkOrSwim">ThinkOrSwim</SelectItem>
                    <SelectItem value="TraderVue">TraderVue</SelectItem>
                    <SelectItem value="Custom">Custom CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Drop your CSV file here or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports .csv files</p>
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'mapping' && (
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
                }).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Select 
                      value={(mapping as any)[key] || ''} 
                      onValueChange={(v) => setMapping({ ...mapping, [key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- Not mapped --</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
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
                        <td className="p-2">{trade.side}</td>
                        <td className="p-2 text-right font-mono">${trade.entry_price.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono">{trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}</td>
                        <td className="p-2 text-right font-mono">{trade.quantity}</td>
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
                <Button variant="outline" onClick={() => setStep('mapping')}>Back</Button>
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
