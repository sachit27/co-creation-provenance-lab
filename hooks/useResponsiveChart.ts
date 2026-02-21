import { useState, useEffect, useRef, RefObject, useMemo } from 'react';

export interface ChartDimensions {
  width: number;
  height: number;
  containerRef: RefObject<HTMLDivElement>;
}

export interface ResponsiveChartConfig {
  fontSize: number;
  barSize: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  labelTruncateLength: number;
  tickFontSize: number;
  legendFontSize: number;
  tooltipMaxWidth: number;
}

export interface UseResponsiveChartReturn extends ChartDimensions {
  config: ResponsiveChartConfig;
  isCompact: boolean;
  isMobile: boolean;
  isTablet: boolean;
}

interface UseResponsiveChartOptions {
  minHeight?: number;
  dataLength?: number;
  hasYAxisLabels?: boolean;
  hasLongLabels?: boolean;
  needsExtraBottomMargin?: boolean;
}

/**
 * Custom hook for responsive chart dimensions and configuration.
 * Uses ResizeObserver to track container size changes.
 * Enhanced for better text scaling and visibility.
 */
export const useResponsiveChart = (
  options: UseResponsiveChartOptions = {}
): UseResponsiveChartReturn => {
  const {
    minHeight = 300,
    dataLength = 10,
    hasYAxisLabels = false,
    hasLongLabels = false,
    needsExtraBottomMargin = false
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({
        width: rect.width || 800,
        height: Math.max(rect.height || 400, minHeight)
      });
    };

    // Initial measurement with slight delay to ensure layout is complete
    requestAnimationFrame(updateDimensions);

    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: width || 800,
          height: Math.max(height || 400, minHeight)
        });
      }
    });

    resizeObserver.observe(container);

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [minHeight]);

  const config = useMemo<ResponsiveChartConfig>(() => {
    const { width, height } = dimensions;

    // Breakpoints
    const isMobile = width < 400;
    const isCompact = width < 500;
    const isTablet = width >= 500 && width < 768;

    // Responsive font sizes with better scaling
    const baseFontSize = isMobile ? 9 : isCompact ? 10 : isTablet ? 11 : 12;
    const fontSize = Math.max(9, Math.min(14, baseFontSize));
    const tickFontSize = Math.max(8, fontSize - 1);
    const legendFontSize = Math.max(9, fontSize - 1);

    // Dynamic bar size based on data length and available height
    const availableHeight = height - (needsExtraBottomMargin ? 120 : 100);
    const barSize = Math.max(8, Math.min(28, Math.floor(availableHeight / (dataLength * 1.5))));

    // Enhanced responsive margins to prevent text cutoff
    const baseLeftMargin = hasYAxisLabels
      ? (hasLongLabels ? (isCompact ? 70 : 100) : (isCompact ? 55 : 85))
      : (isCompact ? 25 : 45);

    const margins = {
      top: isCompact ? 15 : 25,
      right: isCompact ? 20 : 40,
      bottom: needsExtraBottomMargin
        ? (isCompact ? 50 : 60)
        : (isCompact ? 40 : 50),
      left: baseLeftMargin
    };

    // Label truncation length based on available space - more generous
    const labelTruncateLength = isMobile ? 10 : isCompact ? 15 : isTablet ? 20 : 28;

    // Tooltip max width scales with container
    const tooltipMaxWidth = Math.min(280, Math.max(180, width * 0.4));

    return {
      fontSize,
      barSize,
      margins,
      labelTruncateLength,
      tickFontSize,
      legendFontSize,
      tooltipMaxWidth
    };
  }, [dimensions, dataLength, hasYAxisLabels, hasLongLabels, needsExtraBottomMargin]);

  const isCompact = dimensions.width < 500;
  const isMobile = dimensions.width < 400;
  const isTablet = dimensions.width >= 500 && dimensions.width < 768;

  return {
    ...dimensions,
    containerRef,
    config,
    isCompact,
    isMobile,
    isTablet
  };
};

/**
 * Utility to truncate text with ellipsis - enhanced with word boundary awareness
 */
export const truncateText = (text: string, maxLength: number, preserveWords: boolean = false): string => {
  if (!text || text.length <= maxLength) return text || '';

  if (preserveWords && maxLength > 10) {
    // Try to break at word boundary
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) {
      return truncated.substring(0, lastSpace) + '...';
    }
  }

  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Calculate dynamic height for variable data length charts
 */
export const calculateDynamicHeight = (
  dataLength: number,
  rowHeight: number = 30,
  minHeight: number = 300,
  maxHeight: number = 800
): number => {
  const calculatedHeight = dataLength * rowHeight + 120; // +120 for margins and labels
  return Math.min(Math.max(calculatedHeight, minHeight), maxHeight);
};

/**
 * Get responsive column width for flow diagrams - enhanced
 */
export const getResponsiveColumns = (containerWidth: number): {
  leftColWidth: number;
  rightColWidth: number;
  rightColX: number;
  controlOffset: number;
  gapWidth: number;
} => {
  const isMobile = containerWidth < 500;
  const isTablet = containerWidth >= 500 && containerWidth < 768;

  // Better proportions for different screen sizes
  const leftColWidth = isMobile
    ? Math.min(150, containerWidth * 0.32)
    : isTablet
      ? Math.min(180, containerWidth * 0.28)
      : Math.min(220, containerWidth * 0.26);

  const rightColWidth = isMobile
    ? Math.min(200, containerWidth * 0.42)
    : isTablet
      ? Math.min(260, containerWidth * 0.38)
      : Math.min(320, containerWidth * 0.38);

  const rightColX = containerWidth - rightColWidth;
  const gapWidth = rightColX - leftColWidth;
  const controlOffset = gapWidth / 3;

  return {
    leftColWidth,
    rightColWidth,
    rightColX,
    controlOffset,
    gapWidth
  };
};

/**
 * Format number for display with appropriate precision
 */
export const formatMetric = (value: number, precision: number = 2): string => {
  if (value === 0) return '0';
  if (Math.abs(value) < 0.01) return value.toExponential(1);
  return value.toFixed(precision);
};

/**
 * Get color based on value thresholds
 */
export const getThresholdColor = (
  value: number,
  lowThreshold: number,
  highThreshold: number,
  invertScale: boolean = false
): string => {
  if (invertScale) {
    if (value <= lowThreshold) return '#10b981'; // green
    if (value >= highThreshold) return '#ef4444'; // red
    return '#f59e0b'; // amber
  }
  if (value >= highThreshold) return '#10b981';
  if (value <= lowThreshold) return '#ef4444';
  return '#f59e0b';
};

/**
 * Calculate optimal tick count based on axis length
 */
export const getOptimalTickCount = (axisLength: number): number => {
  if (axisLength < 200) return 3;
  if (axisLength < 400) return 5;
  return 7;
};

export default useResponsiveChart;
