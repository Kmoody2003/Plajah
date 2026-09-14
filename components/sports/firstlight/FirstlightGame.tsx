import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FootballEngine } from './game/FootballEngine';
import { ScoreboardHUD } from './components/ScoreboardHUD';
import { MainMenu } from './components/MainMenu';
import { PreDriveModal } from './components/PreDriveModal';
import { StadiumCreatorModal } from './components/StadiumCreatorModal';
import { PlaybookHelpModal } from './components/PlaybookHelpModal';
import { PlayResultBanner } from './components/PlayResultBanner';
import { soundManager } from './audio/SoundManager';
import {
  CameraViewMode,
  DriveState,
  GameMode,
  PlayOutcome,
  PlayType,
  ReceiverRoute,
  WeatherPreset,
} from './types';
import { TEAMS } from './game/constants';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FootballEngine | null>(null);

  // App UI State
  const [playerMode, setPlayerMode] = useState<'BLOCK' | 'ATHLETE'>('ATHLETE');
  const [gameMode, setGameMode] = useState<GameMode>('MENU');
  const [driveState, setDriveState] = useState<DriveState>({
    down: 1,
    yardsToGo: 10,
    ballYardLine: 20,
    playClock: 40,
    quarter: 1,
    timeRemaining: '12:00',
    offenseTeam: { ...TEAMS.AURORA },
    defenseTeam: { ...TEAMS.CURRENT },
    isRedZone: false,
    driveYards: 0,
    playsInDrive: 1,
  });

  const [pocketTime, setPocketTime] = useState<number>(6.5);
  const [receivers, setReceivers] = useState<ReceiverRoute[]>([]);
  const [selectedReceiverIdx, setSelectedReceiverIdx] = useState<number>(1);
  const [isBallSnapped, setIsBallSnapped] = useState<boolean>(false);
  const [isPassInAir, setIsPassInAir] = useState<boolean>(false);
  const [hasBallCarrier, setHasBallCarrier] = useState<boolean>(false);

  // Modals & Options
  const [isGuided, setIsGuided] = useState<boolean>(true);
  const [selectedPlay, setSelectedPlay] = useState<PlayType>('PASS_SLANTS');
  const [currentWeather, setCurrentWeather] = useState<WeatherPreset>('AURORA');
  const [currentCamera, setCurrentCamera] = useState<CameraViewMode>('BEHIND_QB');
  const [showStadiumCreator, setShowStadiumCreator] = useState<boolean>(false);
  const [showControlsHelp, setShowControlsHelp] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [invertControls, setInvertControls] = useState<boolean>(true);
  const [lastOutcome, setLastOutcome] = useState<PlayOutcome | null>(null);

  // Sync invert controls setting with engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.invertControls = invertControls;
    }
  }, [invertControls]);

  // Initialize 3D Engine
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new FootballEngine(containerRef.current);
    engineRef.current = engine;

    // Engine Event Listeners
    engine.onStateChange = (newDriveState, newMode, newPocketTime, newHasCarrier) => {
      setDriveState({ ...newDriveState });
      setPocketTime(newPocketTime);
      setIsBallSnapped(engine.isBallSnapped);
      setIsPassInAir(engine.isPassInAir);
      setHasBallCarrier(newHasCarrier);
    };

    engine.onPlayEnd = (outcome) => {
      setLastOutcome(outcome);
      if (outcome.result === 'TOUCHDOWN') {
        setGameMode('TOUCHDOWN');
      } else if (engine.gameMode === 'TURNOVER') {
        setGameMode('TURNOVER');
      } else {
        setGameMode('PLAY_OVER');
      }
    };

    engine.onReceiverStatusUpdate = (updatedReceivers) => {
      setReceivers([...updatedReceivers]);
    };

    // Pre-populate receivers
    engine.setupPlay(selectedPlay);

    return () => {
      engine.destroy();
    };
  }, []);

  // Sync Guided Mode with Engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.isGuidedMode = isGuided;
    }
  }, [isGuided]);

  // Handlers
  const handlePlayDrive = () => {
    soundManager.playUIClick();
    soundManager.startCrowdAmbience();
    setGameMode('PRE_DRIVE');
  };

  const handleEnterField = () => {
    soundManager.playUIClick();
    if (engineRef.current) {
      engineRef.current.gameMode = 'PLAYING';
      engineRef.current.setupPlay(selectedPlay);
    }
    setGameMode('PLAYING');
    setLastOutcome(null);
  };

  const handleBackToMenu = () => {
    soundManager.playUIClick();
    if (engineRef.current) {
      engineRef.current.gameMode = 'MENU';
      engineRef.current.setCameraMode('BEHIND_QB');
    }
    setGameMode('MENU');
  };

  const handleSelectReceiver = (idx: number) => {
    soundManager.playUIClick();
    setSelectedReceiverIdx(idx);
    if (engineRef.current) {
      engineRef.current.selectTargetReceiver(idx);
    }
  };

  const handleSnapOrThrow = (isBullet: boolean = true) => {
    if (!engineRef.current) return;

    if (!isBallSnapped) {
      engineRef.current.snapBall();
      setIsBallSnapped(true);
    } else if (!isPassInAir) {
      engineRef.current.throwPass(isBullet);
      setIsPassInAir(true);
    }
  };

  const handleMoveQB = (dir: 'LEFT' | 'RIGHT') => {
    if (engineRef.current) {
      engineRef.current.moveQB(dir);
    }
  };

  const handleNextDown = () => {
    soundManager.playUIClick();
    setLastOutcome(null);
    setIsBallSnapped(false);
    setIsPassInAir(false);
    setHasBallCarrier(false);
    if (engineRef.current) {
      engineRef.current.nextDown();
    }
    setGameMode('PLAYING');
  };

  const handleWeatherChange = (weather: WeatherPreset) => {
    setCurrentWeather(weather);
    if (engineRef.current) {
      engineRef.current.setWeather(weather);
    }
  };

  const handleCameraChange = (cam: CameraViewMode) => {
    setCurrentCamera(cam);
    if (engineRef.current) {
      engineRef.current.setCameraMode(cam);
    }
  };

  const handleToggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundManager.setMuted(nextMuted);
  };

  const pressedKeysRef = useRef<Set<string>>(new Set());

  const updateInputFromKeys = useCallback(() => {
    if (!engineRef.current) return;
    const keys = pressedKeysRef.current;
    let forward = 0;
    let lateral = 0;

    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) lateral -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) lateral += 1;

    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');

    engineRef.current.setPlayerInput({
      forward,
      lateral,
      sprint,
    });
  }, []);

  // Keyboard Event Listeners
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      pressedKeysRef.current.add(e.code);
      updateInputFromKeys();

      if (e.code === 'Space' || e.code === 'NumpadEnter' || e.code === 'Numpad0' || e.code === 'Numpad5') {
        e.preventDefault();
        if (gameMode === 'MENU') {
          handlePlayDrive();
        } else if (gameMode === 'PRE_DRIVE') {
          handleEnterField();
        } else if (gameMode === 'PLAYING') {
          if (engineRef.current?.activeBallCarrier) {
            // Ball carrier is running! Space/Numpad0 activates juke evasive sidestep
            engineRef.current.setPlayerInput({ juke: true });
          } else {
            handleSnapOrThrow(true);
          }
        } else if (gameMode === 'PLAY_OVER' || gameMode === 'TOUCHDOWN' || gameMode === 'TURNOVER') {
          handleNextDown();
        }
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        handleSelectReceiver(0);
        if (isBallSnapped && !isPassInAir && !engineRef.current?.activeBallCarrier) {
          handleSnapOrThrow(true);
        }
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        handleSelectReceiver(1);
        if (isBallSnapped && !isPassInAir && !engineRef.current?.activeBallCarrier) {
          handleSnapOrThrow(true);
        }
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        handleSelectReceiver(2);
        if (isBallSnapped && !isPassInAir && !engineRef.current?.activeBallCarrier) {
          handleSnapOrThrow(true);
        }
      } else if (e.code === 'Digit4' || e.code === 'Numpad4') {
        handleSelectReceiver(3);
        if (isBallSnapped && !isPassInAir && !engineRef.current?.activeBallCarrier) {
          handleSnapOrThrow(true);
        }
      } else if (e.code === 'KeyI') {
        // Hotkey to toggle inverted controls
        setInvertControls((prev) => !prev);
      } else if (e.code === 'KeyC') {
        // Cycle cameras
        const cams: CameraViewMode[] = ['BEHIND_QB', 'BROADCAST', 'FIRST_PERSON', 'ALL_22'];
        const nextCam = cams[(cams.indexOf(currentCamera) + 1) % cams.length];
        handleCameraChange(nextCam);
      } else if (e.code === 'KeyM') {
        handleToggleSound();
      }
    },
    [gameMode, isBallSnapped, isPassInAir, currentCamera, isMuted, updateInputFromKeys, handleSelectReceiver, handleSnapOrThrow, handleNextDown, handlePlayDrive, handleEnterField, handleCameraChange, handleToggleSound]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
      updateInputFromKeys();
    },
    [updateInputFromKeys]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div className="relative w-full h-[min(900px,100dvh)] min-h-[600px] overflow-hidden bg-black select-none">
      <label className="absolute bottom-3 right-3 z-50 rounded-xl bg-slate-950/90 border border-white/20 p-2 text-xs text-white">
        Players <select aria-label="Player appearance" className="ml-2 bg-slate-800 rounded p-2" value={playerMode} onChange={e=>{const mode=e.target.value as 'BLOCK'|'ATHLETE';setPlayerMode(mode);engineRef.current?.setPlayerMode(mode);}}>
          <option value="ATHLETE">Athlete · articulated</option><option value="BLOCK">Classic blocks</option>
        </select>
      </label>
      {/* 1. 3D WebGL Canvas Viewport */}
      <div ref={containerRef} className="absolute inset-0 z-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 2. Main Menu View (Screenshot 1) */}
      {gameMode === 'MENU' && (
        <MainMenu
          onPlayDrive={handlePlayDrive}
          onOpenStadiumCreator={() => setShowStadiumCreator(true)}
          onOpenOptions={() => setShowControlsHelp(true)}
          onOpenControls={() => setShowControlsHelp(true)}
          currentWeather={currentWeather}
          onSelectWeather={handleWeatherChange}
          currentCamera={currentCamera}
          onSelectCamera={handleCameraChange}
          isMuted={isMuted}
          onToggleSound={handleToggleSound}
        />
      )}

      {/* 3. Pre-Drive Matchup Modal (Screenshot 3) */}
      {gameMode === 'PRE_DRIVE' && (
        <PreDriveModal
          isGuided={isGuided}
          selectedPlay={selectedPlay}
          onChangeGuided={setIsGuided}
          onChangePlay={setSelectedPlay}
          onEnterField={handleEnterField}
          onBackToMenu={handleBackToMenu}
        />
      )}

      {/* 4. Active Gameplay HUD (Screenshot 2) */}
      {(gameMode === 'PLAYING' || gameMode === 'PLAY_OVER' || gameMode === 'TOUCHDOWN' || gameMode === 'TURNOVER') && (
        <ScoreboardHUD
          driveState={driveState}
          pocketTime={pocketTime}
          receivers={receivers}
          selectedReceiverIdx={selectedReceiverIdx}
          isBallSnapped={isBallSnapped}
          isPassInAir={isPassInAir}
          isGuidedMode={isGuided}
          hasBallCarrier={hasBallCarrier}
          invertControls={invertControls}
          onToggleInvertControls={() => setInvertControls((prev) => !prev)}
          onSelectReceiver={handleSelectReceiver}
          onSnapOrThrow={handleSnapOrThrow}
          onMoveQB={handleMoveQB}
          onMoveInput={(forward, lateral, sprint, juke) => {
            engineRef.current?.setPlayerInput({ forward, lateral, sprint, juke });
          }}
          onNextDown={handleNextDown}
          onOpenControls={() => setShowControlsHelp(true)}
          onOpenStadiumCreator={() => setShowStadiumCreator(true)}
          onToggleSound={handleToggleSound}
          isMuted={isMuted}
          onPause={handleBackToMenu}
        />
      )}

      {/* 5. Play Outcome Banner (Complete / Incomplete / Touchdown / Sack) */}
      {(gameMode === 'PLAY_OVER' || gameMode === 'TOUCHDOWN' || gameMode === 'TURNOVER') && (
        <PlayResultBanner
          outcome={lastOutcome}
          isTouchdown={gameMode === 'TOUCHDOWN'}
          isTurnover={gameMode === 'TURNOVER'}
          onNextDown={handleNextDown}
        />
      )}

      {/* 6. Modals */}
      {showStadiumCreator && (
        <StadiumCreatorModal
          currentWeather={currentWeather}
          currentCamera={currentCamera}
          onSelectWeather={handleWeatherChange}
          onSelectCamera={handleCameraChange}
          onClose={() => setShowStadiumCreator(false)}
        />
      )}

      {showControlsHelp && (
        <PlaybookHelpModal onClose={() => setShowControlsHelp(false)} />
      )}
    </div>
  );
}
