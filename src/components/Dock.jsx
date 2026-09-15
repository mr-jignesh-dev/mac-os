import React from 'react'
import "./dock.scss"

const Dock = ({ windowsState, setWindowsState, activeDockIndex, bringToFront }) => {
  const openOrFocus = (windowName) => {
    setWindowsState((state) => ({ ...state, [windowName]: true }));
    if (bringToFront) {
      bringToFront(windowName);
    }
  };

  const handleMailClick = () => {
    const email = "mr.jignesh.dev@gmail.com";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      window.location.href = `mailto:${email}`;
    } else {
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`, "_blank", "noopener,noreferrer");
    }
  };

  // Helper to add active or neighbor classes for Alt + S cycling
  const getDockItemClass = (index) => {
    if (activeDockIndex === null || activeDockIndex === undefined) return '';
    if (activeDockIndex === index) return 'active';
    if (activeDockIndex === index - 1 || activeDockIndex === index + 1) return 'neighbor';
    return '';
  };

  return (
    <footer className='dock'>
      <div
        onClick={() => openOrFocus('github')}
        className={`icon github ${getDockItemClass(0)}`}
      >
        <img src="/doc-icons/github.svg" alt="GitHub" />
        {windowsState?.github && <span className="active-dot" />}
      </div>

      <div
        onClick={() => openOrFocus('note')}
        className={`icon note ${getDockItemClass(1)}`}
      >
        <img src="/doc-icons/note.svg" alt="Note" />
        {windowsState?.note && <span className="active-dot" />}
      </div>

      <div
        onClick={() => openOrFocus('resume')}
        className={`icon pdf ${getDockItemClass(2)}`}
      >
        <img src="/doc-icons/pdf.svg" alt="Resume" />
        {windowsState?.resume && <span className="active-dot" />}
      </div>

      <div
        onClick={() => window.open("https://calendar.google.com/", "_blank")}
        className={`icon calender ${getDockItemClass(3)}`}
      >
        <img src="/doc-icons/calender.svg" alt="Calendar" />
      </div>

      <div
        onClick={() => openOrFocus('spotify')}
        className={`icon spotify ${getDockItemClass(4)}`}
      >
        <img src="/doc-icons/spotify.svg" alt="Spotify" />
        {windowsState?.spotify && <span className="active-dot" />}
      </div>

      <div
        onClick={handleMailClick}
        className={`icon mail ${getDockItemClass(5)}`}
      >
        <img src="/doc-icons/mail.svg" alt="Mail" />
      </div>

      <div 
        onClick={() => window.open("https://www.linkedin.com/in/jignesh-mkw/", "_blank")}
        className={`icon link ${getDockItemClass(6)}`}
      >
        <img src="/doc-icons/link.svg" alt="LinkedIn" />
      </div>

      <div
        onClick={() => openOrFocus('cli')}
        className={`icon cli ${getDockItemClass(7)}`}
      >
        <img src="/doc-icons/cli.svg" alt="Terminal" />
        {windowsState?.cli && <span className="active-dot" />}
      </div>
    </footer>
  );
};

export default Dock;