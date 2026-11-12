import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Database,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  Info,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { PLATFORM_SPECS, getPlatformColor } from '../utils/platformSpecs';

export const MetricAvailabilityView: React.FC = () => {
  const { analytics, importCsvData } = usePublisher();

  const [csvInput, setCsvInput] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);

  const sampleCsv = `title,views,reach,avg_watch_duration,platform
NextJS 15 Server Actions,14200,18500,22.4,youtube
Micro Frontend Breakdown,8900,11200,18.0,tiktok
Tailwind CSS v4 Quick Tour,21500,28900,25.1,instagram
State Management In 2026,6400,7800,14.5,facebook`;

  const handleImport = () => {
    if (!csvInput.trim()) return;
    const res = importCsvData(csvInput);
    setImportResult(`Successfully imported ${res.importedCount} record(s).`);
    setTimeout(() => setImportResult(null), 4000);
  };

  const handleExportCsv = () => {
    if (analytics.length === 0) {
      alert('No analytics records to export.');
      return;
    }

    const headers = [
      'id',
      'videoId',
      'platform',
      'views',
      'reach',
      'impressions',
      'likes',
      'comments',
      'shares',
      'avgWatchDurationSeconds',
      'avgPercentageWatched',
      'completionRate',
      'earlyAbandonmentRate',
      'source',
      'syncedAt',
    ];

    const rows = analytics.map((a) => [
      a.id,
      a.videoId,
      a.platform,
      a.views,
      a.reach,
      a.impressions,
      a.likes,
      a.comments,
      a.shares,
      a.avgWatchDurationSeconds,
      a.avgPercentageWatched,
      a.completionRate,
      a.earlyAbandonmentRate,
      a.source,
      a.syncedAt,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sra_publisher_analytics_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
            <Database className="w-3.5 h-3.5" />
            <span className="truncate">SECTION 5 SPECIFICATION • METRIC AVAILABILITY LAYER</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Platform Analytics Capabilities & Transparency Matrix
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Real social platform APIs do not expose identical metrics. We maintain realistic mappings and never fabricate fake retention curves.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-slate-700 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition flex items-center justify-center space-x-1.5 self-start min-h-[40px] whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-[#00D6B2]" />
          <span>Export Analytics CSV</span>
        </button>
      </div>

      {/* Platform Capabilities Transparency Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Info className="w-4 h-4 text-[#00D6B2]" />
              <span>Official Social API Metric Support Matrix</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5">
              Distinguishing native platform support vs aggregate estimations.
            </p>
          </div>
          <span className="block lg:hidden text-[10px] font-mono text-[#ADF5E8]">
            â† Swipe to view all columns →
          </span>
        </div>

        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-[var(--bg-surface)] text-[var(--text-secondary)] font-mono uppercase tracking-wider text-[10px] sm:text-[11px]">
              <tr>
                <th className="py-3 px-3 sm:px-4">Platform Channel</th>
                <th className="py-3 px-3 sm:px-4">Views & Reach</th>
                <th className="py-3 px-3 sm:px-4">Avg Duration</th>
                <th className="py-3 px-3 sm:px-4">Watch %</th>
                <th className="py-3 px-3 sm:px-4">Retention Curve</th>
                <th className="py-3 px-3 sm:px-4">Milestones</th>
                <th className="py-3 px-3 sm:px-4">Official Docs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {PLATFORM_SPECS.map((spec) => {
                const color = getPlatformColor(spec.platform);
                return (
                  <tr key={spec.platform} className="hover:bg-[var(--bg-surface-hover)] transition">
                    <td className="py-3.5 px-3 sm:px-4">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${color.bg} ${color.text} ${color.border}`}
                        >
                          {spec.name}
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-1 max-w-xs leading-relaxed">
                        {spec.limitationsNote}
                      </div>
                    </td>

                    {/* Views & Reach */}
                    <td className="py-3.5 px-3 sm:px-4 font-mono">
                      <span className="text-[#00D6B2] flex items-center space-x-1 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Supported</span>
                      </span>
                    </td>

                    {/* Avg Watch Duration */}
                    <td className="py-3.5 px-3 sm:px-4 font-mono">
                      <span className="text-[#00D6B2] flex items-center space-x-1 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Supported</span>
                      </span>
                    </td>

                    {/* Watch % */}
                    <td className="py-3.5 px-3 sm:px-4 font-mono">
                      <span className="text-[#00D6B2] flex items-center space-x-1 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Supported</span>
                      </span>
                    </td>

                    {/* Detailed Retention Curve */}
                    <td className="py-3.5 px-3 sm:px-4 font-mono">
                      {spec.metrics.fullRetentionCurve ? (
                        <span className="text-[#00D6B2] font-bold flex items-center space-x-1 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>1s Granular</span>
                        </span>
                      ) : (
                        <span className="text-red-400 flex items-center space-x-1 font-semibold whitespace-nowrap">
                          <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Not in Public API</span>
                        </span>
                      )}
                    </td>

                    {/* Milestones */}
                    <td className="py-3.5 px-3 sm:px-4 font-mono">
                      {spec.metrics.milestoneViews ? (
                        <span className="text-[#ADF5E8] flex items-center space-x-1 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>25/50/75/100%</span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">”</span>
                      )}
                    </td>

                    {/* Doc Link */}
                    <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
                      <a
                        href={spec.officialDocUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#00D6B2] hover:underline flex items-center space-x-1"
                      >
                        <span>API Docs</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual CSV Analytics Importer */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border-color)] pb-3 gap-2">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-[#00D6B2]" />
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">Manual CSV Analytics Import</h3>
          </div>
          <button
            onClick={() => setCsvInput(sampleCsv)}
            className="text-xs text-[#ADF5E8] hover:underline self-start sm:self-auto"
          >
            Load Sample CSV Template
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          When official platform endpoints restrict historical access or when you export CSV reports from YouTube Studio / Meta Business Suite / TikTok Ads Manager, paste the rows here to populate the historical intelligence store.
        </p>

        <textarea
          rows={5}
          value={csvInput}
          onChange={(e) => setCsvInput(e.target.value)}
          placeholder={`title,views,reach,avg_watch_duration,platform\nMy First Video,12000,15000,18.5,youtube`}
          className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 text-xs font-mono text-[var(--text-primary)] placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]"
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {importResult && (
            <span className="text-xs text-[#00D6B2] font-semibold">{importResult}</span>
          )}
          <div className="sm:ml-auto">
            <button
              onClick={handleImport}
              disabled={!csvInput.trim()}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs hover:opacity-90 transition disabled:opacity-40 flex items-center justify-center space-x-1.5 min-h-[40px]"
            >
              <Upload className="w-3.5 h-3.5 text-black" />
              <span>Import Analytics Records</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
