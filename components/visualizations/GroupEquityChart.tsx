import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Label
} from 'recharts';
import { InterGroupAnalysis, GroupEquityMetrics } from '../../types';
import { getGroupLabel, getGroupColor } from '../../services/groupAnalysis';
import { useResponsiveChart, formatMetric, truncateText } from '../../hooks/useResponsiveChart';
import { ANALYSIS_CONFIG } from '../../constants';
import { InfoIcon } from '../ui/MetricGlossary';

interface GroupEquityChartProps {
  data: InterGroupAnalysis;
}

export const GroupEquityChart: React.FC<GroupEquityChartProps> = ({ data }) => {
  const { containerRef, isCompact, isMobile, config, width } = useResponsiveChart({
    minHeight: 320,
    dataLength: data.groupMetrics.length,
    hasYAxisLabels: true,
    hasLongLabels: true
  });

  // Use config thresholds
  const { representationTarget, matchingThreshold } = ANALYSIS_CONFIG.thresholds;
  const { low: giniLow, moderate: giniModerate } = ANALYSIS_CONFIG.giniInterpretation;

  // Sort groups by average representation (ascending to show inequity)
  const sortedGroups = useMemo(() =>
    [...data.groupMetrics]
      .filter(g => g.participantCount > 0)
      .sort((a, b) => a.avgRepresentation - b.avgRepresentation),
    [data.groupMetrics]
  );

  const chartData = useMemo(() =>
    sortedGroups.map(g => ({
      ...g,
      groupLabel: isCompact ? g.groupId.substring(0, 5).toUpperCase() : getGroupLabel(g.groupId),
      fullLabel: getGroupLabel(g.groupId),
      color: getGroupColor(g.groupId),
      gap: g.avgRepresentation - representationTarget // Gap from target
    })),
    [sortedGroups, isCompact, representationTarget]
  );

  // Calculate overall average for reference line
  const totalParticipants = chartData.reduce((sum, g) => sum + g.participantCount, 0);
  const overallAvg = chartData.reduce((sum, g) => sum + g.avgRepresentation * g.participantCount, 0) / totalParticipants;

  // Find underrepresented groups (below matching threshold)
  const underrepresented = chartData.filter(g => g.avgRepresentation < matchingThreshold);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as GroupEquityMetrics & { groupLabel: string; fullLabel: string; color: string; gap: number };
      const isUnderrepresented = d.avgRepresentation < matchingThreshold;
      return (
        <div
          className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg text-xs z-50"
          style={{ maxWidth: config.tooltipMaxWidth }}
        >
          <div className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="truncate">{d.fullLabel}</span>
            {isUnderrepresented && (
              <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded ml-auto">UNDERREP</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 bg-slate-50 p-2 rounded">
            <span className="text-slate-500">Participants:</span>
            <span className="font-medium text-right">{d.participantCount}</span>
            <span className="text-slate-500">Avg Representation:</span>
            <span className={`font-mono font-medium text-right ${d.avgRepresentation < matchingThreshold ? 'text-red-600' : 'text-green-600'}`}>
              {(d.avgRepresentation * 100).toFixed(0)}%
            </span>
            <span className="text-slate-500">Gap from Target:</span>
            <span className={`font-mono font-medium text-right ${d.gap < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {d.gap >= 0 ? '+' : ''}{(d.gap * 100).toFixed(0)}%
            </span>
            <span className="text-slate-500">Avg Isolation:</span>
            <span className="font-mono text-right">{formatMetric(d.avgIsolation)}</span>
          </div>
          {isUnderrepresented && (
            <div className="mt-2 pt-2 border-t text-[10px] text-red-600">
              ⚠️ This group's perspectives may be systematically underrepresented
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const barSize = Math.max(18, Math.min(36, 220 / Math.max(1, chartData.length)));
  const yAxisWidth = isCompact ? 65 : 100;

  return (
    <div ref={containerRef} className="w-full flex flex-col" style={{ minHeight: '380px' }}>
      {/* Header with Gini */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center">Inter-Group Gini <InfoIcon metricKey="gini" /></div>
            <div className={`text-2xl font-bold ${data.interGroupGini > giniLow ? 'text-red-600' : data.interGroupGini > giniLow/2 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatMetric(data.interGroupGini, 3)}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 max-w-[150px]">
            {data.interGroupGini > giniLow
              ? '⚠️ High inequality between groups'
              : data.interGroupGini > giniLow/2
                ? '⚡ Moderate inequality'
                : '✓ Groups fairly represented'}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="bg-slate-100 rounded-lg px-3 py-2 text-center">
            <div className="text-slate-700 font-bold text-lg">{chartData.length}</div>
            <div className="text-slate-500 text-[10px]">Groups</div>
          </div>
          {underrepresented.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
              <div className="text-red-600 font-bold text-lg">{underrepresented.length}</div>
              <div className="text-red-500 text-[10px]">Underrep.</div>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: '220px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{
              top: 15,
              right: isCompact ? 25 : 40,
              bottom: 20,
              left: 10
            }}
          >
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
            >
              <Label
                value="Average Representation Score"
                position="bottom"
                offset={5}
                style={{ fontSize: config.fontSize, fill: '#475569', fontWeight: 500 }}
              />
            </XAxis>

            <YAxis
              type="category"
              dataKey="groupLabel"
              tick={{ fontSize: config.tickFontSize, fill: '#374151', fontWeight: 500 }}
              width={yAxisWidth}
              tickFormatter={(v) => truncateText(v, isCompact ? 8 : 12)}
              axisLine={{ stroke: '#e2e8f0' }}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />

            <ReferenceLine
              x={overallAvg}
              stroke="#3b82f6"
              strokeDasharray="6 4"
              strokeWidth={2}
            />

            <ReferenceLine
              x={representationTarget}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />

            <ReferenceLine
              x={matchingThreshold}
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            <Bar dataKey="avgRepresentation" barSize={barSize} radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.avgRepresentation < matchingThreshold ? '#ef4444' : entry.color}
                  opacity={entry.avgRepresentation < matchingThreshold ? 0.9 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2 justify-center">
        {chartData.map(g => (
          <div key={g.groupId} className="flex items-center gap-1.5 text-[10px]">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: g.avgRepresentation < matchingThreshold ? '#ef4444' : g.color }}
            />
            <span className={`${g.avgRepresentation < matchingThreshold ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
              {g.fullLabel} ({g.participantCount})
            </span>
          </div>
        ))}
      </div>

      {/* Reference legend */}
      {!isMobile && (
        <div className="mt-2 flex flex-wrap gap-4 justify-center text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500"></span> Overall Avg ({(overallAvg * 100).toFixed(0)}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-500"></span> Target ({(representationTarget * 100).toFixed(0)}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500"></span> At Risk ({(matchingThreshold * 100).toFixed(0)}%)
          </span>
        </div>
      )}
    </div>
  );
};

export default GroupEquityChart;
