import { useState, useEffect, useCallback } from 'react'
import "./app.scss"
import Dock from './components/Dock'
import Nav from './components/Nav'
import Github from './components/windows/Github'
import Note from './components/windows/Note'
import Resume from './components/windows/Resume'
import Spotify from './components/windows/Spotify'
import Cli from './components/windows/Cli'

const DOCK_APPS = [
  'github',
  'note',
  'resume',
  'calendar',
  'spotify',
  'mail',
  'linkedin',
  'cli'
];

const DEFAULT_WINDOWS_STATE = {
  github: false,
  note: false,
  resume: false,
  spotify: false,
  cli: false
};

const DEFAULT_Z_INDEXES = {
  github: 10,
  note: 10,
  resume: 10,
  spotify: 10,
  cli: 10
};

function App() {
  const [windowsState, setWindowsState] = useState(() => {
    try {
      const savedState = localStorage.getItem('mac_windows_state');
      return savedState ? JSON.parse(savedState) : DEFAULT_WINDOWS_STATE;
    } catch (error) {
      console.error('Error reading windows state from localStorage:', error);
      return DEFAULT_WINDOWS_STATE;
    }
  });

  const [zIndices, setZIndices] = useState(DEFAULT_Z_INDEXES);
  
  const [isAltSwitching, setIsAltSwitching] = useState(false);
  const [activeDockIndex, setActiveDockIndex] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem('mac_windows_state', JSON.stringify(windowsState));
    } catch (error) {
      console.error('Error saving windows state to localStorage:', error);
    }
  }, [windowsState]);

  // Guaranteed fresh state calculation for zIndex
  const bringToFront = useCallback((windowName) => {
    setZIndices((prevZ) => {
      const currentValues = Object.values(prevZ);
      const maxZ = currentValues.length ? Math.max(...currentValues) : 10;
      
      // If window is already at highest zIndex, avoid re-rendering
      if (prevZ[windowName] === maxZ && maxZ > 10) return prevZ;

      return {
        ...prevZ,
        [windowName]: maxZ + 1
      };
    });
  }, []);

  const triggerDockAction = useCallback((index) => {
    const appKey = DOCK_APPS[index];
    const email = "mr.jignesh.dev@gmail.com";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    switch (appKey) {
      case 'calendar':
        window.open("https://calendar.google.com/", "_blank");
        break;
      case 'mail':
        if (isMobile) {
          window.location.href = `mailto:${email}`;
        } else {
          window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`, "_blank", "noopener,noreferrer");
        }
        break;
      case 'linkedin':
        window.open("https://www.linkedin.com/in/jignesh-mkw/", "_blank");
        break;
      default:
        setWindowsState((prev) => ({ ...prev, [appKey]: true }));
        bringToFront(appKey);
        break;
    }
  }, [bringToFront]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt + S: Dock Switcher
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isAltSwitching) {
          setIsAltSwitching(true);
          setActiveDockIndex(0);
        } else {
          setActiveDockIndex((prevIndex) => (prevIndex + 1) % DOCK_APPS.length);
        }
      }

      // Alt + X: Close top-most active window
      if (e.altKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        const openWindows = Object.keys(windowsState).filter(app => windowsState[app]);
        if (openWindows.length > 0) {
          let topWindow = openWindows[0];
          let maxZ = zIndices[topWindow] || 10;

          openWindows.forEach(app => {
            if ((zIndices[app] || 10) > maxZ) {
              maxZ = zIndices[app];
              topWindow = app;
            }
          });

          setWindowsState(prev => ({ ...prev, [topWindow]: false }));
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Alt' && isAltSwitching) {
        setIsAltSwitching(false);
        triggerDockAction(activeDockIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [isAltSwitching, activeDockIndex, windowsState, zIndices, triggerDockAction]);

  return (
    <main>
      <Nav />
      <Dock 
        windowsState={windowsState} 
        setWindowsState={setWindowsState} 
        activeDockIndex={isAltSwitching ? activeDockIndex : null}
        bringToFront={bringToFront}
      />

      { windowsState.github && (
        <Github windowName="github" setWindowsState={setWindowsState} zIndex={zIndices.github} bringToFront={bringToFront} />
      )}
      { windowsState.note && (
        <Note windowName="note" setWindowsState={setWindowsState} zIndex={zIndices.note} bringToFront={bringToFront} />
      )}
      { windowsState.resume && (
        <Resume windowName="resume" setWindowsState={setWindowsState} zIndex={zIndices.resume} bringToFront={bringToFront} />
      )}
      { windowsState.spotify && (
        <Spotify windowName="spotify" setWindowsState={setWindowsState} zIndex={zIndices.spotify} bringToFront={bringToFront} />
      )}
      { windowsState.cli && (
        <Cli windowName="cli" setWindowsState={setWindowsState} zIndex={zIndices.cli} bringToFront={bringToFront} />
      )}
    </main>
  );
}

export default App;