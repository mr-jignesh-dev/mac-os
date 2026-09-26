import React, { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import appleLogo from "../assets/apple.svg";

// =====================================================
// TIMING
// =====================================================

const BOOT_DURATION = 1500;
const GREETING_DURATION = 3000;

// =====================================================
// COMPONENT
// =====================================================

const MacOSWebsiteLoader = ({ children }) => {
    const [progress, setProgress] = useState(0);
    const [stage, setStage] = useState("boot");

    // ===================================================
    // APPLE BOOT
    // ===================================================

    useEffect(() => {
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        if (reducedMotion) {
            setProgress(100);
            setStage("complete");
            return;
        }

        let animationFrame;
        const startTime = performance.now();

        const updateProgress = (currentTime) => {
            const elapsed = currentTime - startTime;

            const progressValue = Math.min(
                elapsed / BOOT_DURATION,
                1
            );

            setProgress(progressValue * 100);

            if (progressValue < 1) {
                animationFrame =
                    requestAnimationFrame(updateProgress);
            } else {
                setProgress(100);
                setStage("greeting");
            }
        };

        animationFrame =
            requestAnimationFrame(updateProgress);

        return () => {
            cancelAnimationFrame(animationFrame);
        };
    }, []);

    // ===================================================
    // GREETING
    // ===================================================

    useEffect(() => {
        if (stage !== "greeting") return;

        const timeout = setTimeout(() => {
            setStage("complete");
        }, GREETING_DURATION);

        return () => clearTimeout(timeout);
    }, [stage]);

    // ===================================================
    // RENDER
    // ===================================================

    return (
        <LoaderWrapper>
            {/* =================================================
                STAGE 1 — APPLE
            ================================================= */}

            {stage === "boot" && (
                <BootScreen>
                    <AppleWrapper>
                        <AppleLogo
                            src={appleLogo}
                            alt=""
                            aria-hidden="true"
                        />
                    </AppleWrapper>

                    <ProgressBar>
                        <ProgressFill $progress={progress} />
                    </ProgressBar>
                </BootScreen>
            )}

            {/* =================================================
                STAGE 2 — GREETING
            ================================================= */}

            {stage === "greeting" && (
                <GreetingScreen>
                    <GreetingContainer>
                        <HelloText>
                            Hello
                        </HelloText>

                        <WordWindow>
                            <WordList>
                                <Word>world!</Word>
                                <Word>coder!</Word>
                                <Word>users!</Word>
                                <Word>uiverse</Word>
                            </WordList>
                        </WordWindow>
                    </GreetingContainer>
                </GreetingScreen>
            )}

            {/* =================================================
                STAGE 3 — WEBSITE
            ================================================= */}

            <MainContent $visible={stage === "complete"}>
                {children}
            </MainContent>
        </LoaderWrapper>
    );
};

// =====================================================
// ANIMATIONS
// =====================================================

const appleEntrance = keyframes`
    0% {
        opacity: 0;
        transform: scale(0.92);
        filter: blur(5px);
    }

    45% {
        opacity: 0.75;
        transform: scale(0.97);
        filter: blur(1.5px);
    }

    75% {
        opacity: 0.95;
        transform: scale(0.99);
        filter: blur(0.5px);
    }

    100% {
        opacity: 1;
        transform: scale(1);
        filter: blur(0);
    }
`;

const greetingEntrance = keyframes`
    0% {
        opacity: 0;
        transform: translateY(10px);
        filter: blur(5px);
    }

    100% {
        opacity: 1;
        transform: translateY(0);
        filter: blur(0);
    }
`;

const wordChange = keyframes`
    0%,
    18% {
        transform: translateY(0);
    }

    25%,
    43% {
        transform: translateY(-25%);
    }

    50%,
    68% {
        transform: translateY(-50%);
    }

    75%,
    100% {
        transform: translateY(-75%);
    }
`;

const websiteReveal = keyframes`
    from {
        opacity: 0;
        transform: scale(0.985);
        filter: blur(5px);
    }

    to {
        opacity: 1;
        transform: scale(1);
        filter: blur(0);
    }
`;

// =====================================================
// ROOT
// =====================================================

const LoaderWrapper = styled.div`
    position: fixed;
    inset: 0;

    width: 100%;
    height: 100dvh;
    min-height: 0;

    background: #000;

    overflow: hidden;

    isolation: isolate;
`;

// =====================================================
// BOOT SCREEN
// =====================================================

const BootScreen = styled.div`
    position: fixed;
    inset: 0;

    width: 100%;
    height: 100dvh;

    z-index: 99999;

    background: #000;

    overflow: hidden;
`;

// =====================================================
// APPLE CENTER
// =====================================================

const AppleWrapper = styled.div`
    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;

    display: flex;
    align-items: center;
    justify-content: center;

    pointer-events: none;
`;

// =====================================================
// APPLE LOGO
// =====================================================

const AppleLogo = styled.img`
    width: 58px;
    height: 58px;

    display: block;
    object-fit: contain;

    animation:
        ${appleEntrance}
        0.9s
        cubic-bezier(0.22, 1, 0.36, 1)
        both;

    filter: drop-shadow(
        0 0 16px rgba(255, 255, 255, 0.06)
    );

    user-select: none;
    -webkit-user-drag: none;

    @media (prefers-reduced-motion: reduce) {
        animation: none;
        opacity: 1;
        filter: none;
    }
`;

// =====================================================
// PROGRESS BAR
// =====================================================

const ProgressBar = styled.div`
    position: absolute;

    left: 50%;
    bottom: 72px;

    transform: translateX(-50%);

    width: 150px;
    height: 4px;

    background: #303030;

    border-radius: 999px;

    overflow: hidden;

    @media (max-width: 650px) {
        bottom: calc(
            50px + env(safe-area-inset-bottom)
        );

        width: 140px;
    }

    @media (max-width: 450px) {
        bottom: calc(
            45px + env(safe-area-inset-bottom)
        );

        width: 130px;
    }
`;

// =====================================================
// PROGRESS FILL
// =====================================================

const ProgressFill = styled.div`
    width: ${({ $progress }) => `${$progress}%`};

    height: 100%;

    background: #f5f5f5;

    border-radius: inherit;

    will-change: width;
`;

// =====================================================
// GREETING SCREEN
// =====================================================

const GreetingScreen = styled.div`
    position: fixed;
    inset: 0;

    width: 100%;
    height: 100dvh;

    z-index: 99998;

    display: flex;
    align-items: center;
    justify-content: center;

    background: #000;

    overflow: hidden;
`;

// =====================================================
// GREETING CONTAINER
// =====================================================

const GreetingContainer = styled.div`
    display: flex;
    align-items: center;

    font-family:
        "SF Mono",
        "SFMono-Regular",
        "JetBrains Mono",
        "Fira Code",
        monospace;

    font-size: clamp(24px, 4vw, 36px);

    font-weight: 600;

    letter-spacing: -1px;

    animation:
        ${greetingEntrance}
        0.35s
        cubic-bezier(0.22, 1, 0.36, 1)
        both;

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

// =====================================================
// HELLO TEXT
// =====================================================

const HelloText = styled.span`
    color: #fff;

    margin-right: 12px;

    white-space: nowrap;
`;

// =====================================================
// WORD WINDOW
// =====================================================

const WordWindow = styled.div`
    height: 42px;

    overflow: hidden;

    position: relative;
`;

// =====================================================
// WORD LIST
// =====================================================

const WordList = styled.div`
    display: flex;
    flex-direction: column;

    animation:
        ${wordChange}
        3s
        cubic-bezier(0.4, 0, 0.2, 1)
        forwards;

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

// =====================================================
// WORD
// =====================================================

const Word = styled.span`
    height: 42px;

    display: flex;
    align-items: center;

    color: #16a085;

    white-space: nowrap;
`;

// =====================================================
// WEBSITE
// =====================================================

const MainContent = styled.div`
    width: 100%;
    height: 100dvh;
    min-height: 0;

    overflow: hidden;

    opacity: ${({ $visible }) =>
        $visible ? 1 : 0};

    pointer-events: ${({ $visible }) =>
        $visible ? "auto" : "none"};

    animation:
        ${({ $visible }) =>
            $visible
                ? websiteReveal
                : "none"}
        0.6s
        cubic-bezier(0.22, 1, 0.36, 1)
        both;

    @media (prefers-reduced-motion: reduce) {
        animation: none;

        opacity: ${({ $visible }) =>
            $visible ? 1 : 0};
    }
`;

export default MacOSWebsiteLoader;
