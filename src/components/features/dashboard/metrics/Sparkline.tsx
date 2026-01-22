/**
 * Sparkline Component
 * Simple bar chart visualization for time series data
 */

interface SparklineProps {
  data: number[];
  height?: number;
  width?: number;
  barColor?: string;
}

export function Sparkline({
  data,
  height = 40,
  width = 200,
  barColor = 'fill-emerald-400/60',
}: SparklineProps) {
  const max = Math.max(...data, 1);
  const barWidth = width / data.length - 1;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {data.map((value, index) => {
        const barHeight = (value / max) * height;
        return (
          <rect
            key={index}
            x={index * (barWidth + 1)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            className={barColor}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

export default Sparkline;
