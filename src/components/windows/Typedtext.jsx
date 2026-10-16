import React, { useState, useEffect } from "react";

const TypedText = ({ text, speed = 8, onDone, onUpdate }) => {
  const [shown, setShown] = useState("");

  useEffect(() => {
    let i = 0;
    setShown("");
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      onUpdate && onUpdate();
      if (i >= text.length) {
        clearInterval(id);
        onDone && onDone();
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return <pre className="cli-out">{shown}</pre>;
};

export default TypedText;