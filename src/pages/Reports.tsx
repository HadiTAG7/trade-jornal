import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, Download } from 'lucide-react';

export default function Reports() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Generate and download performance reports</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Weekly Report
              </CardTitle>
              <CardDescription>
                Generate a comprehensive weekly trading summary
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Includes KPIs, best/worst days, top strategies, equity curve, and trading notes.
                </p>
                <Button className="w-full">
                  <Calendar className="mr-2 h-4 w-4" />
                  Generate Weekly Report
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Monthly Report
              </CardTitle>
              <CardDescription>
                Generate a detailed monthly performance analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Comprehensive monthly breakdown with trend analysis and improvement areas.
                </p>
                <Button className="w-full" variant="outline">
                  <Calendar className="mr-2 h-4 w-4" />
                  Generate Monthly Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Previous Reports</CardTitle>
            <CardDescription>Download your previously generated reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No reports generated yet</p>
              <p className="text-sm mt-1">Generate your first report above</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
