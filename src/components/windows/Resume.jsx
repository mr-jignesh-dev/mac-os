import React from 'react'
import MacWindow from './MacWindow'
import "./resume.scss"

const Resume = ({ windowName, setWindowsState, zIndex, bringToFront }) => {
    return (
        <MacWindow
            windowName={windowName}
            setWindowsState={setWindowsState}
            zIndex={zIndex}
            bringToFront={bringToFront}
        >
            <div className="resume-window">
                <embed src="/Jignesh_Makwana_Resume_v1.pdf" frameBorder="0"></embed>
            </div>
        </MacWindow>
    )
}

export default Resume