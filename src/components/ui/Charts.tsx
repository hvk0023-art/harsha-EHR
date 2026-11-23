import React, { useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  hint?: string;
}

export const SimpleBarChart: React.FC<{
  data: BarDatum[];
  height?: number;
  primaryColor?: string;
  secondaryColor?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}> = ({
  data,
  height = 190,
  primaryColor = '#185FA5',
  secondaryColor = '#85B7EB',
  valuePrefix = '',
  valueSuffix = '',
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.map((d) => d.value + (d.secondaryValue || 0)));

  return (
    <div className="w-full">
      <div className="relative" style={{ height }}>
        <div className="flex items-end gap-2 h-full pt-6 pb-6 px-2 border-b border-slate-200">
          {data.map((d, idx) => {
            const total = d.value + (d.secondaryValue || 0);
            const pct = Math.max(4, Math.round((total / maxVal) * 100));
            const primaryPct = total > 0 ? Math.round((d.value / total) * 100) : 100;
            return (
              <div
                key={d.label}
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
                className="flex-1 flex flex-col items-center justify-end h-full relative group"
              >
                {hovered === idx && (
                  <div className="absolute -top-1 z-10 bg-[#042C53] text-white text-[11px] px-2 py-1 rounded shadow-sm whitespace-nowrap tabular-nums pointer-events-none">
                    {d.label}: {valuePrefix}
                    {d.value.toLocaleString()}
                    {valueSuffix}
                    {d.secondaryValue ? ` (+${d.secondaryValue})` : ''}
                  </div>
                )}
                <span className="text-[10px] font-mono text-[#5F5D56] mb-1 tabular-nums truncate max-w-full">
                  {total > 0 ? `${valuePrefix}${total.toLocaleString()}${valueSuffix}` : `${valuePrefix}0${valueSuffix}`}
                </span>
                <div
                  className="w-full max-w-[44px] rounded-t overflow-hidden flex flex-col-reverse transition-opacity"
                  style={{ height: `${pct}%` }}
                >
                  <div style={{ height: `${primaryPct}%`, backgroundColor: primaryColor }} />
                  {d.secondaryValue ? (
                    <div
                      style={{ height: `${100 - primaryPct}%`, backgroundColor: secondaryColor }}
                    />
                  ) : null}
                </div>
                <span className="text-[11px] text-[#5F5D56] mt-1.5 truncate max-w-full tabular-nums">
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export interface LinePoint {
  label: string;
  value: number;
  projected?: boolean;
}

export const SimpleLineChart: React.FC<{
  points: LinePoint[];
  unit?: string;
  referenceMax?: number;
  referenceMin?: number;
  height?: number;
  color?: string;
}> = ({ points, unit = '', referenceMax, referenceMin, height = 170, color = '#185FA5' }) => {
  if (points.length === 0) {
    return <div className="text-xs text-[#5F5D56] py-6 text-center">No numeric trend points available.</div>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values, referenceMin ?? values[0]) * 0.9;
  const max = Math.max(...values, referenceMax ?? values[0]) * 1.1 || 10;
  const width = 520;
  const padX = 36;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - ((p.value - min) / (max - min || 1)) * innerH;
    return { ...p, x, y };
  });

  const solidCoords = coords.filter((c) => !c.projected);
  const pathSolid = solidCoords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const projStart = solidCoords[solidCoords.length - 1];
  const projCoords = coords.filter((c) => c.projected);
  const pathProjected =
    projStart && projCoords.length > 0
      ? [projStart, ...projCoords]
          .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(' ')
      : '';

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto min-w-[320px]"
        role="img"
        aria-label="Trend line chart"
      >
        {/* Reference Band if provided */}
        {typeof referenceMin === 'number' && typeof referenceMax === 'number' && (
          <rect
            x={padX}
            y={padY + innerH - ((referenceMax - min) / (max - min || 1)) * innerH}
            width={innerW}
            height={Math.max(
              2,
              (((referenceMax - referenceMin) / (max - min || 1)) * innerH)
            )}
            fill="#E6F1FB"
            opacity="0.7"
          />
        )}
        <line x1={padX} y1={padY + innerH} x2={width - padX} y2={padY + innerH} stroke="#CBD5E1" strokeWidth="1" />
        {pathSolid && <path d={pathSolid} fill="none" stroke={color} strokeWidth="2.5" />}
        {pathProjected && (
          <path d={pathProjected} fill="none" stroke={color} strokeWidth="2" strokeDasharray="5 4" />
        )}
        {coords.map((c, idx) => (
          <g key={`${c.label}-${idx}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r={c.projected ? 4 : 4.5}
              fill={c.projected ? '#FFFFFF' : color}
              stroke={color}
              strokeWidth="2"
            />
            <text
              x={c.x}
              y={c.y - 9}
              textAnchor="middle"
              fontSize="10"
              fill="#042C53"
              className="font-mono tabular-nums"
            >
              {c.value}
              {unit ? ` ${unit}` : ''}
            </text>
            <text
              x={c.x}
              y={height - 4}
              textAnchor="middle"
              fontSize="10"
              fill="#5F5D56"
            >
              {c.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
