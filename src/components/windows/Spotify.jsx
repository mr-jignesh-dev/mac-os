import React, { useState, useEffect } from 'react'
import MacWindow from './MacWindow'
import "./spotify.scss"

const Spotify = ({ windowName, setWindowsState, zIndex, bringToFront }) => {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const handleOpenSpotifyApp = () => {
        const artistId = "0YC192cP3KPCRWx8zr8MfZ";
        const appUri = `spotify:artist:${artistId}`;
        const webUrl = `https://open.spotify.com/artist/${artistId}`;

        // Attempt to launch the native Spotify app
        window.location.href = appUri;

        // Fallback to web URL after a short timeout if the app is not installed
        setTimeout(() => {
            window.open(webUrl, "_blank");
        }, 1000);
    };

    return (
        <MacWindow
            width={isMobile ? "85vw" : "25vw"}
            height="420px"
            windowName={windowName}
            setWindowsState={setWindowsState}
            zIndex={zIndex}
            bringToFront={bringToFront}
        >
            <div className="spotify-window">
                {isMobile ? (
                    <div className="spotify-mobile-fallback">
                        <div className="artist-card">
                            <img
                                src="https://image-cdn-ak.spotifycdn.com/image/ab6761610000f178371632043a8c12bb7eeeaf9d"
                                alt="Hans Zimmer"
                                className="artist-img"
                            />
                            <h3>Hans Zimmer</h3>
                            <p>Play tracks directly in the Spotify app.</p>
                            <button
                                onClick={handleOpenSpotifyApp}
                                className="spotify-btn"
                            >
                                Open in Spotify App
                            </button>
                        </div>
                    </div>
                ) : (
                    <iframe
                        data-testid="embed-iframe"
                        title="Spotify Player"
                        style={{ borderRadius: "12px", border: "none" }}
                        src="https://open.spotify.com/embed/artist/0YC192cP3KPCRWx8zr8MfZ?utm_source=generator&theme=0&si=9315dd112ac44713"
                        width="100%"
                        height="100%"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                    ></iframe>
                )}
            </div>
        </MacWindow>
    )
}

export default Spotify