import React, { useState, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import "./window.scss"

const calculateCenterLayout = (windowName) => {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const isMobile = screenWidth <= 768;

  const targetWidth = isMobile
    ? Math.min(screenWidth - 32, 340)
    : Math.min(Math.floor(screenWidth * 0.5), 700);

  const targetHeight = isMobile
    ? Math.min(screenHeight - 120, 500)
    : Math.min(Math.floor(screenHeight * 0.6), 600);

  let defaultX = Math.max(16, Math.floor((screenWidth - targetWidth) / 2));
  let defaultY = isMobile ? 45 : 60;

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

  return { x: defaultX, y: defaultY, width: targetWidth, height: targetHeight };
};

const MacWindow = ({
  children,
  windowName,
  setWindowsState,
  originRect,
  zIndex = 10,
  bringToFront
}) => {
  const [layout, setLayout] = useState(() => calculateCenterLayout(windowName));
  const [phase, setPhase] = useState('opening');

  useEffect(() => {
    if (bringToFront) {
      bringToFront(windowName);
    }
  }, []);

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
      onMouseDown={handleFocus}
      onTouchStart={handleFocus}
      onDragStart={handleFocus}
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
    >
      <div
        onMouseDown={handleFocus}
        onTouchStart={handleFocus}
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