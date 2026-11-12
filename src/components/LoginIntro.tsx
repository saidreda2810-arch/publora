import React, { useEffect, useRef, useState } from 'react';

// App-open brand splash: plays the Publora cinematic sting once, muted,
// before the website is revealed. Skipped entirely for reduced-motion users
// (handled by the caller).
const MAX_INTRO_MS = 6000; // safety cap — never trap the user on the intro

export const LoginIntro: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const doneRef = useRef(false);
  const [exiting, setExiting] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setExiting(true);
    setTimeout(onDone, 900); // matches .intro-exit duration
  };

  useEffect(() => {
    const t = setTimeout(finish, MAX_INTRO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[200] bg-[var(--bg-main)] flex items-center justify-center ${exiting ? 'intro-exit' : 'intro-enter'}`}
      aria-hidden="true"
    >
      <video
        src="/publora-intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        className={`w-full h-full object-cover ${exiting ? 'intro-video-out' : 'intro-video-in'}`}
      />
    </div>
  );
};
