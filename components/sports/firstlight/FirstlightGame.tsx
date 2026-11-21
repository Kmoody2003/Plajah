import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FootballEngine } from './game/FootballEngine';
import { ScoreboardHUD } from './components/ScoreboardHUD';
import { MainMenu } from './components/MainMenu';
import { PreDriveModal } from './components/PreDriveModal';
import { PlaycallOverlay } from './components/PlaycallOverlay';
import { StadiumCreatorModal } from './components/StadiumCreatorModal';
import { PlaybookHelpModal } from './components/PlaybookHelpModal';
import { PlayResultBanner } from './components/PlayResultBanner';
import { soundManager } from './audio/SoundManager';
import { createEmptyBoxScore, createInitialArcadeState } from './game/GameRules';
import { SOL_TEAMS } from './game/leagueData';
import {
  ArcadeState,
  CameraViewMode,
  ControlSideMode,
  DefensePlayType,
  DriveState,
  GameMode,
  KickMeterState,
  MatchBoxScore,
  PlayOutcome,
  PlayStyleMode,
  PlayType,
  ReceiverRoute,
  SkillLevel,
  WeatherPreset,
} from './types';

export default function FirstlightGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FootballEngine | null>(null);

  // Match Configuration State
  const [playStyle, setPlayStyle] = useState<PlayStyleMode>('SIMULATION');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('PRO');
  const [controlSide, setControlSide] = useState<ControlSideMode>('FULL_GAME');
  const [playerMode, setPlayerMode] = useState<'BLOCK' | 'ATHLETE'>('ATHLETE');
  const [userTeamId, setUserTeamId] = useState<string>('AURORA');
  const [cpuTeamId, setCpuTeamId] = useState<string>('IRONPORT');
  const [quarterLengthSeconds, setQuarterLengthSeconds] = useState<number>(180);

  // Live Gameplay State
  const [gameMode, setGameMode] = useState<GameMode>('MENU');
  const [driveState, setDriveState] = useState<DriveState>({
    down: 1,
    yardsToGo: 10,
    ballYardLine: 25,
    playClock: 25,
    quarter: 1,
    timeRemaining: '3:00',
    offenseTeam: { ...SOL_TEAMS.AURORA },
    defenseTeam: { ...SOL_TEAMS.IRONPORT },
    homeTeam: { ...SOL_TEAMS.AURORA },
    awayTeam: { ...SOL_TEAMS.IRONPORT },
    possession: 'USER',
    playStyle: 'SIMULATION',
    skillLevel: 'PRO',
    controlSide: 'FULL_GAME',
    isRedZone: false,
    driveYards: 0,
    playsInDrive: 1,
  });

  const [arcadeState, setArcadeState] = useState<ArcadeState>(createInitialArcadeState());
  const [kickMeter, setKickMeter] = useState<KickMeterState>({
    active: false,
    kind: 'FG',
    phase: 'POWER',
    power: 0.2,
    accuracy: 0,
    distanceYards: 35,
    windX: 0,
  });
  const [boxScore, setBoxScore] = useState<MatchBoxScore>(createEmptyBoxScore());
  const [pocketTime, setPocketTime] = useState<number>(6.2);
  const [receivers, setReceivers] = useState<ReceiverRoute[]>([]);
  const [selectedReceiverIdx, setSelectedReceiverIdx] = useState<number>(0);
  const [isBallSnapped, setIsBallSnapped] = useState<boolean>(false);
  const [isPassInAir, setIsPassInAir] = useState<boolean>(false);
  const [hasBallCarrier, setHasBallCarrier] = useState<boolean>(false);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  // Modals & Options
  const [isGuided, setIsGuided] = useState<boolean>(true);
  const [selectedPlay, setSelectedPlay] = useState<PlayType>('PASS_SLANTS');
  const [currentWeather, setCurrentWeather] = useState<WeatherPreset>('AURORA');
  const [currentCamera, setCurrentCamera] = useState<CameraViewMode>('BEHIND_QB');
  const [showStadiumCreator, setShowStadiumCreator] = useState<boolean>(false);
  const [showControlsHelp, setShowControlsHelp] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [invertControls, setInvertControls] = useState<boolean>(false);
  const [lastOutcome, setLastOutcome] = useState<PlayOutcome | null>(null);

  useEffect(() => {
    if (engineRef.current) engineRef.current.invertControls = invertControls;
  }, [invertControls]);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new FootballEngine(containerRef.current);
    engineRef.current = engine;

    engine.onStateChange = (newDrive, newMode, newPocket, newCarrier, newArcade, newKick, newBox) => {
      setDriveState({ ...newDrive });
      setGameMode(newMode);
      setPocketTime(newPocket);
      setIsBallSnapped(engine.isBallSnapped);
      setIsPassInAir(engine.isPassInAir);
      setHasBallCarrier(newCarrier);
      setArcadeState({ ...newArcade });
      setKickMeter({ ...newKick });
      setBoxScore({ user: { ...newBox.user }, cpu: { ...newBox.cpu } });
      setIsReplaying(engine.isReplaying);
    };

    engine.onPlayEnd = (outcome) => {
      setLastOutcome(outcome);
    };

    engine.onReceiverStatusUpdate = (updatedReceivers) => {
      setReceivers([...updatedReceivers]);
    };

    engine.setupPlay(selectedPlay);

    return () => {
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.isGuidedMode = isGuided;
  }, [isGuided]);

  const handleOpenSetup = useCallback((style?: PlayStyleMode, mode?: 'ATHLETE' | 'BLOCK') => {
    soundManager.playUIClick();
    soundManager.startCrowdAmbience();
    if (style) setPlayStyle(style);
    if (mode) {
      setPlayerMode(mode);
      engineRef.current?.setPlayerMode(mode);
    }
    setGameMode('PRE_DRIVE');
    if (engineRef.current) engineRef.current.gameMode = 'PRE_DRIVE';
  }, []);

  const handleEnterField = useCallback(() => {
    soundManager.playUIClick();
    soundManager.startCrowdAmbience();
    const team = SOL_TEAMS[userTeamId] || SOL_TEAMS.AURORA;
    const weather = team.defaultWeather || currentWeather;
    setCurrentWeather(weather);
    setLastOutcome(null);
    if (engineRef.current) {
      engineRef.current.startNewMatch({
        userTeamId,
        cpuTeamId,
        playStyle,
        skillLevel,
        controlSide,
        quarterLengthSeconds,
        weather,
        playerMode,
      });
      engineRef.current.gameMode = 'PLAYING';
      engineRef.current.setupPlay(selectedPlay);
    }
    setGameMode('PLAYING');
  }, [userTeamId, cpuTeamId, playStyle, skillLevel, controlSide, quarterLengthSeconds, playerMode, currentWeather, selectedPlay]);

  const handleBackToMenu = useCallback(() => {
    soundManager.playUIClick();
    if (engineRef.current) {
      engineRef.current.stopInstantReplay();
      engineRef.current.gameMode = 'MENU';
      engineRef.current.setCameraMode('BEHIND_QB');
    }
    setGameMode('MENU');
  }, []);

  const handleSelectReceiver = useCallback((idx: number) => {
    soundManager.playUIClick();
    setSelectedReceiverIdx(idx);
    engineRef.current?.selectTargetReceiver(idx);
  }, []);

  const handleSnapOrThrow = useCallback((isBullet: boolean = true) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.gameMode === 'KICKING') {
      eng.advanceKickMeter();
      return;
    }
    if (!eng.isBallSnapped) {
      eng.snapBall();
      setIsBallSnapped(true);
    } else if (!eng.isPassInAir && !eng.activeBallCarrier && eng.driveState.possession !== 'CPU') {
      eng.throwPass(isBullet);
      setIsPassInAir(true);
    }
  }, []);

  const handleNextDown = useCallback(() => {
    soundManager.playUIClick();
    setLastOutcome(null);
    setIsBallSnapped(false);
    setIsPassInAir(false);
    setHasBallCarrier(false);
    engineRef.current?.nextDown(true);
  }, []);

  const handleCallOffensePlay = useCallback((play: PlayType) => {
    soundManager.playUIClick();
    setSelectedPlay(play);
    setLastOutcome(null);
    setSelectedReceiverIdx(0);
    engineRef.current?.launchSelectedPlay(play);
  }, []);

  const handleCallDefensePlay = useCallback((defPlay: DefensePlayType) => {
    soundManager.playUIClick();
    setLastOutcome(null);
    engineRef.current?.launchSelectedPlay(selectedPlay, defPlay);
  }, [selectedPlay]);

  const handleWeatherChange = useCallback((weather: WeatherPreset) => {
    setCurrentWeather(weather);
    engineRef.current?.setWeather(weather);
  }, []);

  const handleCameraChange = useCallback((cam: CameraViewMode) => {
    setCurrentCamera(cam);
    engineRef.current?.setCameraMode(cam);
  }, []);

  const handleToggleSound = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundManager.setMuted(next);
      return next;
    });
  }, []);

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
    engineRef.current.setPlayerInput({ forward, lateral, sprint });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }

      pressedKeysRef.current.add(e.code);
      updateInputFromKeys();
      if (e.repeat) return;

      const eng = engineRef.current;
      const isLobModifier = e.shiftKey;

      if (e.code === 'Space' || e.code === 'NumpadEnter' || e.code === 'Numpad0') {
        if (gameMode === 'MENU') {
          handleOpenSetup();
        } else if (gameMode === 'PRE_DRIVE') {
          handleEnterField();
        } else if (gameMode === 'KICKING') {
          eng?.advanceKickMeter();
        } else if (gameMode === 'PLAYING') {
          if (eng?.driveState.possession === 'CPU' && eng.isBallSnapped) {
            eng.triggerSkillMove('HIT_STICK');
          } else if (eng?.activeBallCarrier) {
            eng.triggerSkillMove('JUKE');
          } else {
            handleSnapOrThrow(true);
          }
        } else if (gameMode === 'PLAY_OVER' || gameMode === 'TOUCHDOWN' || gameMode === 'TURNOVER' || gameMode === 'HALFTIME') {
          handleNextDown();
        }
      } else if (e.code === 'KeyX') {
        eng?.triggerSkillMove('SPIN');
      } else if (e.code === 'KeyF' || e.code === 'KeyV') {
        eng?.triggerSkillMove(eng.driveState.possession === 'CPU' ? 'HIT_STICK' : 'TRUCK');
      } else if (e.code === 'KeyE') {
        eng?.triggerSkillMove('DIVE');
      } else if (e.code === 'Tab') {
        eng?.switchUserDefender();
      } else if (e.code === 'KeyQ') {
        eng?.flipCurrentPlay();
      } else if (['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3', 'Digit4', 'Numpad4'].includes(e.code)) {
        const idx = Number(e.code.slice(-1)) - 1;
        handleSelectReceiver(idx);
        if (eng?.isBallSnapped && !eng.isPassInAir && !eng.activeBallCarrier && eng.driveState.possession !== 'CPU') {
          handleSnapOrThrow(!isLobModifier);
        }
      } else if (e.code === 'KeyI') {
        setInvertControls((prev) => !prev);
      } else if (e.code === 'KeyC') {
        const cams: CameraViewMode[] = ['BEHIND_QB', 'BROADCAST', 'ALL_22', 'FIRST_PERSON'];
        const nextCam = cams[(cams.indexOf(currentCamera) + 1) % cams.length];
        handleCameraChange(nextCam);
      } else if (e.code === 'KeyM') {
        handleToggleSound();
      }
    },
    [
      gameMode,
      currentCamera,
      updateInputFromKeys,
      handleOpenSetup,
      handleEnterField,
      handleSnapOrThrow,
      handleNextDown,
      handleSelectReceiver,
      handleCameraChange,
      handleToggleSound,
    ]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
      updateInputFromKeys();
    },
    [updateInputFromKeys]
  );

  useEffect(() => {
    const clearInput = () => {
      pressedKeysRef.current.clear();
      engineRef.current?.setPlayerInput({ forward: 0, lateral: 0, sprint: false, juke: false });
    };
    const visibility = () => {
      if (document.hidden) clearInput();
    };
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const showGameplayHud =
    gameMode === 'PLAYING' ||
    gameMode === 'PLAYCALL' ||
    gameMode === 'KICKING' ||
    gameMode === 'PAT_CHOICE' ||
    gameMode === 'PLAY_OVER' ||
    gameMode === 'TOUCHDOWN' ||
    gameMode === 'TURNOVER' ||
    gameMode === 'HALFTIME' ||
    gameMode === 'GAME_OVER';

  return (
    <div className="relative w-full h-[min(900px,100dvh)] min-h-[600px] overflow-hidden bg-black select-none">
      {/* Quick Appearance Switcher (Pro Football vs Blocky Classic) */}
      {gameMode === 'PLAYING' && !isBallSnapped && (
        <label className="hidden sm:flex items-center absolute top-28 right-3 z-20 rounded-xl bg-slate-950/90 border border-white/20 px-2.5 py-1.5 text-xs text-white">
          Players
          <select
            aria-label="Player appearance"
            className="ml-2 bg-slate-800 rounded px-2 py-1 text-xs"
            value={playerMode}
            onChange={(e) => {
              const mode = e.target.value as 'BLOCK' | 'ATHLETE';
              setPlayerMode(mode);
              engineRef.current?.setPlayerMode(mode);
            }}
          >
            <option value="ATHLETE">Pro Football</option>
            <option value="BLOCK">Blocky Classic</option>
          </select>
        </label>
      )}

      {/* Quick Pre-Snap Audible Selector */}
      {gameMode === 'PLAYING' && !isBallSnapped && driveState.possession !== 'CPU' && (
        <div className="absolute top-28 left-3 z-20 rounded-xl border border-white/20 bg-slate-950/92 p-2.5 text-white text-xs max-w-[230px]">
          <label className="block text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1">
            Pre-Snap Audible
          </label>
          <select
            aria-label="Pre-snap play"
            className="bg-slate-800 rounded p-1.5 w-full text-xs font-semibold"
            value={selectedPlay}
            onChange={(e) => {
              if (engineRef.current?.isBallSnapped) return;
              const play = e.target.value as PlayType;
              setSelectedPlay(play);
              engineRef.current?.setupPlay(play);
              setSelectedReceiverIdx(0);
            }}
          >
            <option value="PASS_SLANTS">Quick Slants (Pass)</option>
            <option value="PASS_POST_OUT">Post &amp; Speed Out (Pass)</option>
            <option value="PASS_VERTS">Four Verticals (Pass)</option>
            <option value="PASS_MESH">Mesh Traffic (Pass)</option>
            <option value="PASS_FLOOD">Tri-Level Flood (Pass)</option>
            <option value="PASS_PA_DAGGER">PA Deep Dagger (Play Action)</option>
            <option value="RUN_HB_DIVE">HB Inside Dive (Run)</option>
            <option value="RUN_HB_SWEEP">HB Toss Sweep (Run)</option>
            <option value="RUN_READ_OPTION">QB Read Option (Run)</option>
            <option value="ST_FIELD_GOAL">Field Goal Unit</option>
            <option value="ST_PUNT">Punt Unit</option>
          </select>
          <label className="flex gap-2 items-center mt-1.5 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => {
                if (engineRef.current) engineRef.current.showRoutes = e.target.checked;
              }}
            />
            Show Route Art
          </label>
        </div>
      )}

      {/* 1. 3D WebGL Stadium & Field Viewport */}
      <div ref={containerRef} className="absolute inset-0 z-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 2. Main Menu */}
      {gameMode === 'MENU' && (
        <MainMenu
          onPlayDrive={handleOpenSetup}
          onOpenStadiumCreator={() => setShowStadiumCreator(true)}
          onOpenOptions={() => setShowStadiumCreator(true)}
          onOpenControls={() => setShowControlsHelp(true)}
          currentWeather={currentWeather}
          onSelectWeather={handleWeatherChange}
          currentCamera={currentCamera}
          onSelectCamera={handleCameraChange}
          isMuted={isMuted}
          onToggleSound={handleToggleSound}
        />
      )}

      {/* 3. Matchup, Mode & Skill Setup Modal */}
      {gameMode === 'PRE_DRIVE' && (
        <PreDriveModal
          playStyle={playStyle}
          skillLevel={skillLevel}
          controlSide={controlSide}
          playerMode={playerMode}
          userTeamId={userTeamId}
          cpuTeamId={cpuTeamId}
          quarterLengthSeconds={quarterLengthSeconds}
          isGuided={isGuided}
          selectedPlay={selectedPlay}
          onChangePlayStyle={setPlayStyle}
          onChangeSkillLevel={setSkillLevel}
          onChangeControlSide={setControlSide}
          onChangePlayerMode={(m) => {
            setPlayerMode(m);
            engineRef.current?.setPlayerMode(m);
          }}
          onChangeUserTeam={setUserTeamId}
          onChangeCpuTeam={setCpuTeamId}
          onChangeQuarterLength={setQuarterLengthSeconds}
          onChangeGuided={setIsGuided}
          onChangePlay={setSelectedPlay}
          onEnterField={handleEnterField}
          onBackToMenu={handleBackToMenu}
        />
      )}

      {/* 4. Pro Broadcast Scorebug & Live Gameplay HUD */}
      {showGameplayHud && (
        <ScoreboardHUD
          driveState={driveState}
          gameMode={gameMode}
          arcadeState={arcadeState}
          kickMeter={kickMeter}
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
          onAdvanceKick={() => engineRef.current?.advanceKickMeter()}
          onTriggerSkillMove={(m) => engineRef.current?.triggerSkillMove(m)}
          onSwitchDefender={() => engineRef.current?.switchUserDefender()}
          onOpenPlaybook={() => {
            if (engineRef.current && !engineRef.current.isBallSnapped) {
              engineRef.current.gameMode = 'PLAYCALL';
              setGameMode('PLAYCALL');
            }
          }}
          onFlipPlay={() => engineRef.current?.flipCurrentPlay()}
          onCallTimeout={() => engineRef.current?.callTimeout()}
          onMoveQB={(dir) => engineRef.current?.moveQB(dir)}
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

      {/* 5. Madden-Style Visual Playbook Drawer */}
      {gameMode === 'PLAYCALL' && (
        <PlaycallOverlay
          driveState={driveState}
          isDefenseCall={driveState.possession === 'CPU'}
          onCallOffensePlay={handleCallOffensePlay}
          onCallDefensePlay={handleCallDefensePlay}
          onFlipPlay={() => engineRef.current?.flipCurrentPlay()}
        />
      )}

      {/* 6. Play Outcome, PAT Choice, Instant Replay & Box Score Banner */}
      {(gameMode === 'PLAY_OVER' ||
        gameMode === 'TOUCHDOWN' ||
        gameMode === 'PAT_CHOICE' ||
        gameMode === 'TURNOVER' ||
        gameMode === 'HALFTIME' ||
        gameMode === 'GAME_OVER') && (
        <PlayResultBanner
          outcome={lastOutcome}
          gameMode={gameMode}
          driveState={driveState}
          boxScore={boxScore}
          isReplaying={isReplaying}
          onNextDown={handleNextDown}
          onChoosePat={(kind) => engineRef.current?.choosePatOption(kind)}
          onToggleReplay={() => {
            if (isReplaying) engineRef.current?.stopInstantReplay();
            else engineRef.current?.startInstantReplay();
          }}
          onRematch={handleEnterField}
          onBackToMenu={handleBackToMenu}
        />
      )}

      {/* 7. Modals */}
      {showStadiumCreator && (
        <StadiumCreatorModal
          currentWeather={currentWeather}
          currentCamera={currentCamera}
          playerMode={playerMode}
          playStyle={playStyle}
          skillLevel={skillLevel}
          onSelectWeather={handleWeatherChange}
          onSelectCamera={handleCameraChange}
          onSelectPlayerMode={(m) => {
            setPlayerMode(m);
            engineRef.current?.setPlayerMode(m);
          }}
          onSelectPlayStyle={(st) => {
            setPlayStyle(st);
            engineRef.current?.setPlayStyle(st);
          }}
          onSelectSkillLevel={(sk) => {
            setSkillLevel(sk);
            engineRef.current?.setSkillLevel(sk);
          }}
          onClose={() => setShowStadiumCreator(false)}
        />
      )}

      {showControlsHelp && <PlaybookHelpModal onClose={() => setShowControlsHelp(false)} />}
    </div>
  );
}
