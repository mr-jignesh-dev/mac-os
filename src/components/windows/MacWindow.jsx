import React, { useState, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import "./window.scss"

const MOBILE_BREAKPOINT = 768;

// Reserved space around the mobile window so it clears the top menu bar
// and the bottom dock rather than sitting flush against them.
const MOBILE_SIDE_MARGIN = 10;
const MOBILE_TOP_MARGIN = 40;
const MOBILE_BOTTOM_MARGIN = 96;

// visualViewport reflects the ACTUAL visible area on mobile — it shrinks
// when the on-screen keyboard opens or the browser's address bar is
// showing, where window.innerWidth/innerHeight often don't update (or
// update inconsistently across browsers). Falling back to innerWidth/
// innerHeight keeps this working in environments without the API.
const getViewportSize = () => {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  if (window.visualViewport) {
    return { width: window.visualViewport.width, height: window.visualViewport.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
};

// Parses "420px", "85vw", "25vh", or a plain number/numeric string into a
// pixel value. Returns null for anything it can't make sense of, so the
// caller can fall back to the normal computed default.
const parseDimension = (value, viewportSize) => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.endsWith('vw') || trimmed.endsWith('vh')) {
    const pct = parseFloat(trimmed);
    return Number.isNaN(pct) ? null : Math.round((pct / 100) * viewportSize);
  }
  const n = parseFloat(trimmed);
  return Number.isNaN(n) ? null : n;
};

const calculateCenterLayout = (windowName, widthOverride, heightOverride) => {
  const { width: screenWidth, height: screenHeight } = getViewportSize();
  const isMobile = screenWidth <= MOBILE_BREAKPOINT;

  // Mobile: actually fill the viewport (minus a small margin for the menu
  // bar/dock) instead of capping out at a fixed 340x500 — that fixed cap
  // is exactly what left a visibly empty gap around the window on any
  // phone larger than a small one. Width/height overrides (e.g. Spotify's
  // compact size) are still ignored here, since the mobile layout is
  // meant to always match the device, not a per-app custom size.
  const targetWidth = isMobile
    ? screenWidth - MOBILE_SIDE_MARGIN * 2
    : parseDimension(widthOverride, screenWidth) ?? Math.min(Math.floor(screenWidth * 0.5), 700);

  const targetHeight = isMobile
    ? screenHeight - MOBILE_TOP_MARGIN - MOBILE_BOTTOM_MARGIN
    : parseDimension(heightOverride, screenHeight) ?? Math.min(Math.floor(screenHeight * 0.6), 600);

  let defaultX = isMobile
    ? MOBILE_SIDE_MARGIN
    : Math.max(16, Math.floor((screenWidth - targetWidth) / 2));
  let defaultY = isMobile ? MOBILE_TOP_MARGIN : 60;

  const defaultLayout = { x: defaultX, y: defaultY, width: targetWidth, height: targetHeight };

  // Mobile windows can't be resized or dragged (see MacWindow below), so
  // there's nothing meaningful to "restore" — always fit the CURRENT
  // viewport instead of a saved size from a different device, browser
  // chrome state, or orientation.
  if (isMobile) return defaultLayout;

  try {
    const savedLayouts = localStorage.getItem('mac_windows_layout');
    if (savedLayouts) {
      const parsed = JSON.parse(savedLayouts);
      if (parsed[windowName]) {
        const saved = parsed[windowName];
        if (saved.x + saved.width <= screenWidth && saved.width <= screenWidth) {
          return {
            x: Math.max(10, saved.x),
            y: Math.max(30, saved.y),
            width: saved.width,
            height: saved.height
          };
        }
      }
    }
  } catch (e) {
    console.error('Error reading localStorage:', e);
  }

  return defaultLayout;
};

const MacWindow = ({
  children,
  windowName,
  setWindowsState,
  originRect,
  zIndex = 10,
  bringToFront,
  width,
  height
}) => {
  const [layout, setLayout] = useState(() => calculateCenterLayout(windowName, width, height));
  const [phase, setPhase] = useState('opening');
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT
  );

  useEffect(() => {
    if (bringToFront) {
      bringToFront(windowName);
    }
  }, []);

  // On mobile, the window always fits the current viewport rather than
  // whatever size it happened to be on mount — re-fit it on rotation,
  // or when mobile browser chrome/on-screen keyboard changes the visible
  // area. visualViewport fires its own resize event that's more reliable
  // for that second case than the window's resize event in some browsers.
  useEffect(() => {
    const handleViewportResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setLayout(calculateCenterLayout(windowName, width, height));
      }
    };
    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    return () => {
      window.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, [windowName, width, height]);

  const saveLayout = (newLayout) => {
    setLayout(newLayout);
    try {
      const savedLayouts = JSON.parse(localStorage.getItem('mac_windows_layout') || '{}');
      savedLayouts[windowName] = newLayout;
      localStorage.setItem('mac_windows_layout', JSON.stringify(savedLayouts));
    } catch (e) {
      console.error('Error saving window layout:', e);
    }
  };

  const handleClose = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPhase('closing');
  };

  const handleAnimationEnd = (e) => {
    if (e.animationName === 'windowOpen') {
      setPhase('open');
    } else if (e.animationName === 'windowClose') {
      setWindowsState(state => ({ ...state, [windowName]: false }));
    }
  };

  const handleFocus = () => {
    if (bringToFront) {
      bringToFront(windowName);
    }
  };

  return (
    <Rnd
      cancel=".dots"
      dragHandleClassName="nav"
      enableUserSelectHack={false}
      position={{ x: layout.x, y: layout.y }}
      size={{ width: layout.width, height: layout.height }}
      style={{ zIndex: zIndex }}
      onDragStart={handleFocus}
      onResizeStart={handleFocus}
      onDragStop={(e, d) => {
        saveLayout({ ...layout, x: d.x, y: d.y });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        saveLayout({
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
          x: position.x,
          y: position.y
        });
      }}
      bounds="window"
      minWidth={260}
      minHeight={180}
      // Mobile: fixed, viewport-fitted size — no drag handles, no resize
      // handles. Desktop keeps full drag/resize as before.
      enableResizing={!isMobile}
      disableDragging={isMobile}
    >
      <div
        // onMouseDown/onTouchStart passed directly to <Rnd> above aren't
        // real react-rnd props (its API only exposes onDragStart/
        // onResizeStart/etc.), so they were never actually doing
        // anything — this is the one reliable focus trigger: a real
        // native listener on an actual DOM node, firing on ANY
        // interaction with the window (nav bar, buttons, canvas, a
        // tap that never turns into a drag) regardless of whether
        // dragging/resizing happen to be enabled.
        onPointerDown={handleFocus}
        className={`window ${phase !== 'open' ? `window--${phase}` : ''}`}
        style={{
          '--window-z-index': zIndex,
          height: '100%',
          width: '100%'
        }}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="nav">
          <div className="dots">
            <div
              onClick={handleClose}
              className="dot red"
              role="button"
              aria-label="Close window"
            ></div>
            <div className="dot yellow"></div>
            <div className="dot green"></div>
          </div>
          <div className="title"><p>jigneshmakwana - {windowName}</p></div>
        </div>

        <div className="main-content">
          {children}
        </div>
      </div>
    </Rnd>
  );
};

export default MacWindow; 