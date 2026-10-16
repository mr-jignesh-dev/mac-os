import React from "react";

const CommandChips = ({ items, onRun }) => (
  <div className="cli-chips">
    {items.map((item) => (
      <button
        key={item.label}
        type="button"
        className="cli-chip"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRun(item.run);
        }}
      >
        {item.label}
      </button>
    ))}
  </div>
);

export default CommandChips;