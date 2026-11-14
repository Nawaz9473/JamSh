import { useState, useEffect } from 'react';
import { useWindowDimensions, Platform } from 'react-native';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ResponsiveInfo {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
  isMobile: boolean;
  isSmallMobile: boolean; // < 380px width (iPhone SE, small Androids)
  isTablet: boolean;      // 768px - 1023px width
  isDesktop: boolean;     // >= 1024px width
  isLandscape: boolean;
  isShortScreen: boolean; // < 700px height (iPhone SE, landscape, virtual keyboard)
  safeArea: SafeAreaInsets;
  safeAreaTop: number;
  safeAreaBottom: number;
  safeAreaLeft: number;
  safeAreaRight: number;
  // Adaptive spacing helpers
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  // Responsive width helpers
  contentWidth: number;
  cardWidth: number;
}

/**
 * Probes the browser environment for actual CSS safe-area-inset values.
 */
function getComputedSafeInsets(): SafeAreaInsets {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  try {
    // Check if test element already exists or create one
    let probe = document.getElementById('__jamsh_safe_area_probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = '__jamsh_safe_area_probe';
      probe.style.position = 'fixed';
      probe.style.top = '0';
      probe.style.left = '0';
      probe.style.width = '0';
      probe.style.height = '0';
      probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
      probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
      probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
      probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.zIndex = '-9999';
      document.body.appendChild(probe);
    }

    const computed = window.getComputedStyle(probe);
    const top = parseFloat(computed.paddingTop) || 0;
    const bottom = parseFloat(computed.paddingBottom) || 0;
    const left = parseFloat(computed.paddingLeft) || 0;
    const right = parseFloat(computed.paddingRight) || 0;

    // Detect Capacitor native shell heuristics if CSS returns 0 but on mobile device
    const isCapacitor = !!(window as any).Capacitor;
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');

    let fallbackTop = top;
    let fallbackBottom = bottom;

    if (isCapacitor || isMobileDevice) {
      // If notch device / iPhone with safe area
      if (top === 0 && window.screen.height >= 800) {
        fallbackTop = 44; // standard iOS notch / Android punch hole
      } else if (top === 0 && isMobileDevice) {
        fallbackTop = 24; // standard Android status bar
      }

      if (bottom === 0 && window.screen.height >= 800) {
        fallbackBottom = 34; // standard iOS home indicator
      } else if (bottom === 0 && isMobileDevice) {
        fallbackBottom = 16; // standard Android gesture indicator
      }
    }

    return {
      top: Math.max(top, fallbackTop),
      bottom: Math.max(bottom, fallbackBottom),
      left,
      right,
    };
  } catch (e) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

export function useResponsive(): ResponsiveInfo {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const [safeArea, setSafeArea] = useState<SafeAreaInsets>(getComputedSafeInsets);

  useEffect(() => {
    const updateInsets = () => {
      setSafeArea(getComputedSafeInsets());
    };

    updateInsets();
    window.addEventListener('resize', updateInsets);
    window.addEventListener('orientationchange', updateInsets);

    return () => {
      window.removeEventListener('resize', updateInsets);
      window.removeEventListener('orientationchange', updateInsets);
    };
  }, []);

  const isMobile = width < 768;
  const isSmallMobile = width < 380;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isLandscape = width > height && height < 600;
  const isShortScreen = height < 700;

  // Responsive adaptive spacing
  const spacing = {
    xs: isSmallMobile ? 4 : 6,
    sm: isSmallMobile ? 8 : 12,
    md: isSmallMobile ? 12 : 16,
    lg: isSmallMobile ? 18 : 24,
    xl: isSmallMobile ? 24 : 32,
  };

  // Content width bounded for ideal reading/feed layout
  const contentWidth = isMobile
    ? Math.max(width, 320)
    : Math.min(width - 320, 680);

  // Card width for feed posts and modal dialogs
  const cardWidth = isMobile
    ? Math.min(width, 480)
    : 470;

  return {
    width,
    height,
    scale,
    fontScale,
    isMobile,
    isSmallMobile,
    isTablet,
    isDesktop,
    isLandscape,
    isShortScreen,
    safeArea,
    safeAreaTop: safeArea.top,
    safeAreaBottom: safeArea.bottom,
    safeAreaLeft: safeArea.left,
    safeAreaRight: safeArea.right,
    spacing,
    contentWidth,
    cardWidth,
  };
}
