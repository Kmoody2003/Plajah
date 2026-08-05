import React, { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ChevronRight, ChevronLeft, Play, RotateCcw,
  Trophy, Target, Zap, Users, BookOpen, Lightbulb, Gamepad2,
  Star, TrendingUp, Shield, Circle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type SportLeague = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'FIFA' | 'MLS';

type Section = 'OVERVIEW' | 'FIELD' | 'POSITIONS' | 'SCORING' | 'RULES' | 'STRATEGY' | 'PLAY';

interface SectionConfig { id: Section; label: string; icon: React.ReactNode }

interface Position { id: string; name: string; abbr: string; x: number; y: number; role: string; key: string[] }

interface SportData {
  name: string;
  league: string;
  tagline: string;
  color: string;
  accent: string;
  overview: string;
  objective: string;
  quickFacts: { label: string; value: string }[];
  positions: Position[];
  scoringRules: { name: string; points: string; description: string; icon: string }[];
  keyRules: { title: string; description: string }[];
  strategies: { name: string; side: 'offense' | 'defense'; description: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SPORT DATA
// ─────────────────────────────────────────────────────────────────────────────

const SPORT_DATA: Record<SportLeague, SportData> = {
  NBA: {
    name: 'Basketball', league: 'NBA', tagline: 'Score more points than your opponent in 48 minutes',
    color: '#C9082A', accent: '#17408B',
    overview: `Basketball is a fast-paced sport played between two teams of 5 players each. The goal is simple: put the orange ball through the opponent's hoop while preventing them from doing the same. An NBA game consists of four 12-minute quarters, and the team with the most points at the end wins. The game was invented by Dr. James Naismith in 1891 and has grown into a global phenomenon.`,
    objective: 'Score more points than the opposing team by shooting the ball through the basket.',
    quickFacts: [
      { label: 'Players per side', value: '5' },
      { label: 'Game length', value: '4 × 12 min' },
      { label: 'Shot clock', value: '24 seconds' },
      { label: 'Court length', value: '94 ft' },
      { label: 'Basket height', value: '10 ft' },
      { label: 'Ball size', value: '29.5 in circumference' },
    ],
    positions: [
      { id: 'PG', name: 'Point Guard', abbr: 'PG', x: 50, y: 82, role: 'The floor general. Brings the ball up, calls plays, creates opportunities for teammates. Needs elite dribbling and passing.', key: ['Ball-handling', 'Passing', 'Court vision'] },
      { id: 'SG', name: 'Shooting Guard', abbr: 'SG', x: 78, y: 72, role: 'Primary scorer and perimeter shooter. Usually the team\'s best 3-point shooter and defender on the wing.', key: ['3-point shooting', 'Off-ball movement', 'Defense'] },
      { id: 'SF', name: 'Small Forward', abbr: 'SF', x: 22, y: 72, role: 'The versatile glue player. Can guard multiple positions, drive to the basket, and shoot from outside.', key: ['Versatility', 'Driving', 'Rebounding'] },
      { id: 'PF', name: 'Power Forward', abbr: 'PF', x: 32, y: 55, role: 'Physical big who fights for rebounds and scores in the paint. Modern PFs also shoot 3s ("stretch four").', key: ['Rebounding', 'Post play', 'Screen-setting'] },
      { id: 'C', name: 'Center', abbr: 'C', x: 50, y: 48, role: 'The anchor of the team, usually the tallest player. Protects the rim on defense and scores near the basket.', key: ['Shot blocking', 'Rebounding', 'Post scoring'] },
    ],
    scoringRules: [
      { name: '3-Point Shot', points: '3 pts', description: 'A shot made from behind the 3-point arc (23\'9\" from center of basket). High-risk, high-reward.', icon: '🎯' },
      { name: '2-Point Shot', points: '2 pts', description: 'Any made field goal inside the 3-point arc — layups, dunks, mid-range jumpers.', icon: '🏀' },
      { name: 'Free Throw', points: '1 pt', description: 'An uncontested shot from 15 ft after being fouled. Each free throw is worth 1 point.', icon: '🎳' },
    ],
    keyRules: [
      { title: 'Shot Clock', description: 'Teams must attempt a shot within 24 seconds of gaining possession. If the clock expires, the other team gets the ball.' },
      { title: 'Traveling', description: 'You can\'t take more than 2 steps without dribbling. Moving your pivot foot while holding the ball is a violation.' },
      { title: 'Fouls', description: 'Personal contact with an opponent is a foul. After 6 personal fouls, a player is ejected. After the 5th team foul per quarter, the fouled team shoots free throws.' },
      { title: 'Out of Bounds', description: 'If the ball or the ball-carrier touches the out-of-bounds line, possession transfers to the other team.' },
      { title: 'Double-Dribble', description: 'Once a player stops dribbling and picks the ball up, they cannot dribble again. They must pass or shoot.' },
      { title: 'Backcourt Violation', description: 'Once the offense crosses halfcourt, they cannot pass the ball back into the backcourt.' },
    ],
    strategies: [
      { name: 'Pick and Roll', side: 'offense', description: 'A teammate (the screener) blocks a defender so the ball-handler can drive or shoot. The screener then "rolls" to the basket for a pass.' },
      { name: 'Triangle Offense', side: 'offense', description: 'Players position in a triangle shape to create passing angles and drive lanes. Made famous by the Chicago Bulls dynasty.' },
      { name: 'Fast Break', side: 'offense', description: 'After a rebound or turnover, push the ball up court quickly before the defense can set up. Numbers advantage = easy baskets.' },
      { name: 'Zone Defense (2-3)', side: 'defense', description: 'Instead of guarding a player, each defender guards an area. 2 players at the top, 3 across the baseline. Clogs the paint.' },
      { name: 'Man-to-Man Defense', side: 'defense', description: 'Each defender is assigned a specific opponent to guard throughout the possession. Requires athletic defenders.' },
      { name: 'Full-Court Press', side: 'defense', description: 'Defense applies pressure starting from the opponent\'s baseline. Forces turnovers and disrupts the offense\'s rhythm.' },
    ],
  },

  NFL: {
    name: 'American Football', league: 'NFL', tagline: 'Advance the ball 10 yards in 4 tries or lose possession',
    color: '#013369', accent: '#D50A0A',
    overview: `American football is a strategic, physical sport played between two teams of 11 players. The offense tries to advance the ball down the field to score touchdowns or field goals, while the defense tries to stop them. The NFL game consists of four 15-minute quarters with a halftime break. Every play is a chess match between the offensive coordinator and the defensive coordinator.`,
    objective: 'Score more points than the opponent by reaching the end zone or kicking field goals.',
    quickFacts: [
      { label: 'Players per side', value: '11' },
      { label: 'Game length', value: '4 × 15 min' },
      { label: 'Play clock', value: '40 seconds' },
      { label: 'Field length', value: '100 yards + 2 end zones' },
      { label: 'First down', value: '10 yards needed' },
      { label: 'Ball', value: 'Prolate spheroid, 11 in' },
    ],
    positions: [
      { id: 'QB', name: 'Quarterback', abbr: 'QB', x: 50, y: 58, role: 'The leader of the offense. Takes the snap, hands off or throws the ball. Must read the defense and make quick decisions under pressure.', key: ['Passing', 'Reading defense', 'Leadership'] },
      { id: 'RB', name: 'Running Back', abbr: 'RB', x: 50, y: 66, role: 'Carries the ball on running plays and catches short passes. Must be powerful enough to break tackles and fast enough to outrun defenders.', key: ['Speed', 'Power', 'Pass catching'] },
      { id: 'WR', name: 'Wide Receiver', abbr: 'WR', x: 15, y: 60, role: 'Lines up wide and runs routes to get open for passes. The primary targets for the QB. Elite route-running and speed are critical.', key: ['Route running', 'Catching', 'Speed'] },
      { id: 'OL', name: 'Offensive Line', abbr: 'OL', x: 50, y: 52, role: 'Five big blockers (Center, 2 Guards, 2 Tackles) who protect the QB and create running lanes. Unsung heroes of every offense.', key: ['Blocking', 'Strength', 'Communication'] },
      { id: 'TE', name: 'Tight End', abbr: 'TE', x: 78, y: 57, role: 'Hybrid player who blocks like a lineman but can also run routes and catch passes. A matchup nightmare for defenses.', key: ['Blocking', 'Receiving', 'Size'] },
      { id: 'DE', name: 'Defensive End', abbr: 'DE', x: 30, y: 42, role: 'Rushes the passer and stops runs on the edge. The premier pass rusher position — a great DE can single-handedly disrupt an offense.', key: ['Pass rush', 'Edge setting', 'Speed'] },
      { id: 'LB', name: 'Linebacker', abbr: 'LB', x: 50, y: 38, role: 'Plays in the middle of the defense. Stops runs, covers short passes, and blitzes the QB. The quarterback of the defense.', key: ['Tackling', 'Coverage', 'Blitzing'] },
      { id: 'CB', name: 'Cornerback', abbr: 'CB', x: 18, y: 35, role: 'Covers wide receivers and defends against the pass. Must be able to run with elite speedsters and win one-on-one matchups.', key: ['Coverage', 'Ball skills', 'Speed'] },
      { id: 'S', name: 'Safety', abbr: 'S', x: 50, y: 28, role: 'Last line of defense. Roams the deep middle, helps on run support, and covers receivers over the middle. Two safeties play per team.', key: ['Ball hawking', 'Run support', 'Range'] },
    ],
    scoringRules: [
      { name: 'Touchdown', points: '6 pts', description: 'Carry or catch the ball in the opponent\'s end zone. After a TD, the team kicks for an extra point or goes for 2.', icon: '🏈' },
      { name: 'Extra Point (PAT)', points: '1 pt', description: 'A kick through the uprights from the 15-yard line after a touchdown. Successful ~94% of the time in NFL.', icon: '🦵' },
      { name: '2-Point Conversion', points: '2 pts', description: 'Instead of kicking the PAT, the team runs a play from the 2-yard line. Higher risk, higher reward.', icon: '⚡' },
      { name: 'Field Goal', points: '3 pts', description: 'A kick through the uprights on any down. Typically attempted on 4th down when a touchdown is unlikely.', icon: '🎯' },
      { name: 'Safety', points: '2 pts', description: 'The defense tackles an offensive player in their own end zone. Rare but momentum-shifting. The defense also gets the ball back.', icon: '🛡️' },
    ],
    keyRules: [
      { title: 'The Down System', description: 'The offense gets 4 attempts (downs) to advance the ball 10 yards. If they succeed, they get a new set of 4 downs. Fail all 4, and the other team gets the ball.' },
      { title: 'Fumble', description: 'If a ball-carrier drops the ball and the defense picks it up, it\'s a fumble — the defense takes possession wherever they recover it.' },
      { title: 'Interception', description: 'If a defender catches a pass intended for an offensive player, it\'s an interception. The defense now has the ball at the spot of the catch.' },
      { title: 'Pass Interference', description: 'Defenders cannot grab or hold a receiver before the ball arrives. The offense gets the ball at the spot of the foul (or 15 yds in college).' },
      { title: 'False Start / Offside', description: 'The offense cannot move before the snap; the defense cannot cross the line of scrimmage early. Both are 5-yard penalties.' },
      { title: '2-Minute Warning', description: 'Play stops automatically with 2 minutes left in each half. Teams can use this to regroup and plan their strategy.' },
    ],
    strategies: [
      { name: 'West Coast Offense', side: 'offense', description: 'Short, horizontal passes that stretch the defense side-to-side. Uses the passing game as an extension of the run game. Popularized by Bill Walsh.' },
      { name: 'Play-Action Pass', side: 'offense', description: 'QB fakes a handoff to freeze the linebackers, then throws deep. Highly effective when the run game has been working.' },
      { name: 'Four-Minute Drill', side: 'offense', description: 'When leading late, run the ball every play to drain the clock. Forces the defense to stop the run and uses precious time.' },
      { name: 'Cover 2', side: 'defense', description: 'Two safeties split the deep field in half. Five defenders cover underneath zones. Stops the deep ball but vulnerable in the flat.' },
      { name: 'Blitz', side: 'defense', description: 'Send extra rushers (5+) at the QB to force a quick decision or sack. High risk — if the blitz is picked up, receivers get open deep.' },
      { name: 'Prevent Defense', side: 'defense', description: 'Drop multiple defenders deep to prevent big plays. Used late in games when protecting a lead. Critics say it only "prevents" winning.' },
    ],
  },

  MLB: {
    name: 'Baseball', league: 'MLB', tagline: 'Score more runs than your opponent over 9 innings',
    color: '#002D72', accent: '#D50A0A',
    overview: `Baseball is a bat-and-ball sport where one team pitches and fields while the other bats, taking turns over 9 innings. The batting team tries to hit the ball and advance runners around 4 bases to score "runs." There is no clock in baseball — each team gets exactly 3 outs per inning. Strategic decisions around pitching, fielding shifts, and when to steal bases make it a deeply tactical game.`,
    objective: 'Score more runs than the opponent by hitting the ball and advancing runners around all four bases.',
    quickFacts: [
      { label: 'Players per side', value: '9' },
      { label: 'Innings', value: '9 (or extra innings)' },
      { label: 'Outs per inning', value: '3 per team' },
      { label: 'Base distance', value: '90 feet' },
      { label: 'Pitching distance', value: '60\'6"' },
      { label: 'Ball diameter', value: '2.9 inches' },
    ],
    positions: [
      { id: 'P', name: 'Pitcher', abbr: 'P', x: 50, y: 52, role: 'Throws the ball to the batter from 60\'6" away. The most important position. Uses speed, spin, and location to get batters out.', key: ['Velocity', 'Control', 'Breaking ball'] },
      { id: 'C', name: 'Catcher', abbr: 'C', x: 50, y: 78, role: 'Crouches behind the plate and receives pitches. Also calls pitches, manages the pitcher, and guards home plate. The field general.', key: ['Pitch framing', 'Arm strength', 'Game calling'] },
      { id: '1B', name: '1st Base', abbr: '1B', x: 72, y: 62, role: 'Guards first base and receives throws to retire batters on grounders. Typically a big, powerful left-handed hitter.', key: ['Fielding', 'Scooping throws', 'Power hitting'] },
      { id: '2B', name: '2nd Base', abbr: '2B', x: 62, y: 48, role: 'Middle infielder who covers second base and turns double plays with the shortstop. Quick reflexes and sure hands required.', key: ['Double plays', 'Range', 'Quick release'] },
      { id: 'SS', name: 'Shortstop', abbr: 'SS', x: 40, y: 48, role: 'The most athletic infielder, covering the large gap between 2nd and 3rd. Often the best fielder on the team.', key: ['Range', 'Arm strength', 'Athletics'] },
      { id: '3B', name: '3rd Base', abbr: '3B', x: 28, y: 62, role: 'The "hot corner" — hard-hit balls come screaming at the 3B. Must have quick reactions and a cannon arm to throw across the diamond.', key: ['Reactions', 'Arm strength', 'Power'] },
      { id: 'LF', name: 'Left Field', abbr: 'LF', x: 22, y: 30, role: 'Patrols left field, catches fly balls, and handles balls off the wall. Needs good instincts and a solid arm to throw to third.', key: ['Tracking fly balls', 'Arm', 'Speed'] },
      { id: 'CF', name: 'Center Field', abbr: 'CF', x: 50, y: 22, role: 'The captain of the outfield, covering the most ground. Must be the fastest outfielder with elite instincts for reading batted balls.', key: ['Speed', 'Range', 'Leadership'] },
      { id: 'RF', name: 'Right Field', abbr: 'RF', x: 78, y: 30, role: 'Requires the strongest arm of all outfielders — long throws to third base on singles. Often a power hitter.', key: ['Arm strength', 'Power hitting', 'Tracking'] },
    ],
    scoringRules: [
      { name: 'Single', points: 'Advances 1 base', description: 'Batter hits the ball and safely reaches 1st base. Runners on base advance 1 or more bases depending on the hit.', icon: '⚾' },
      { name: 'Home Run', points: '1+ Runs', description: 'Ball hit out of the park (or rare inside-the-park HR). All runners on base and the batter score. A grand slam = 4 runners = 4 runs.', icon: '💥' },
      { name: 'RBI', points: 'Run scored', description: 'When a batter\'s hit (or walk with bases loaded) causes a teammate to score, the batter earns an RBI (Run Batted In).', icon: '🏃' },
      { name: 'Walk (BB)', points: 'Free base', description: '4 balls (pitches outside the strike zone) in one at-bat earns the batter a free trip to first base. Runners advance if forced.', icon: '🎁' },
    ],
    keyRules: [
      { title: 'Strike Zone', description: 'The area over home plate between the batter\'s knees and mid-torso. A pitch in this zone is a strike whether the batter swings or not.' },
      { title: 'Three Strikes', description: 'Three strikes = the batter is out. A swinging strike, a called strike (pitch in the zone the batter doesn\'t swing at), or a foul ball (unlimited, except on the 3rd strike).' },
      { title: 'Force Out vs. Tag Out', description: 'On a force play (runner must advance), fielders just touch the base. On a non-force play, the fielder must tag the runner with the ball.' },
      { title: 'Infield Fly Rule', description: 'With runners on 1st and 2nd (or bases loaded) and fewer than 2 outs, an easy pop-up is automatically an out — preventing the defense from dropping it on purpose to get a double play.' },
      { title: 'Stolen Base', description: 'A runner can attempt to advance a base while the pitcher is winding up. If the catcher\'s throw doesn\'t beat the runner, it\'s a stolen base.' },
      { title: 'Balk', description: 'The pitcher makes an illegal move on the mound with runners on base. All runners advance one base as a penalty.' },
    ],
    strategies: [
      { name: 'Hit and Run', side: 'offense', description: 'The runner on 1st starts running on the pitch while the batter swings to hit the ball through the gap left by the moving infielder.' },
      { name: 'Sacrifice Bunt', side: 'offense', description: 'The batter intentionally taps the ball softly to move a runner into scoring position, sacrificing themselves as an out.' },
      { name: 'Shift Defense', side: 'defense', description: 'Repositioning fielders to where a specific batter historically hits the ball most. Heavily used until MLB banned it in 2023.' },
      { name: 'Platoon Advantage', side: 'defense', description: 'Right-handed pitchers fare better against left-handed batters and vice versa. Managers exploit this with pinch hitters and bullpen matchups.' },
      { name: 'Stolen Base Threat', side: 'offense', description: 'A fast runner at 1st forces the pitcher to throw quicker and less effectively, also drawing the catcher\'s focus from calling pitches.' },
      { name: 'Pitch Sequencing', side: 'defense', description: 'Mixing fastballs, changeups, and breaking balls (curveball, slider) in a way the batter can\'t predict — the art of pitching.' },
    ],
  },

  NHL: {
    name: 'Ice Hockey', league: 'NHL', tagline: 'Score more goals than your opponent in 60 minutes',
    color: '#000000', accent: '#FFB81C',
    overview: `Ice hockey is played on a large ice rink between two teams of 6 players (including the goalie), who use sticks to shoot a rubber puck into the opponent's net. An NHL game is 3 periods of 20 minutes each. Players skate at high speeds, change on-the-fly, and can check opponents into the boards. It's the fastest team sport in the world and demands extraordinary athleticism.`,
    objective: 'Score more goals than the opponent by shooting the puck into their net.',
    quickFacts: [
      { label: 'Players per side', value: '6 (inc. goalie)' },
      { label: 'Game length', value: '3 × 20 min' },
      { label: 'Rink size', value: '200 × 85 ft' },
      { label: 'Puck size', value: '3 in diameter, 1 in thick' },
      { label: 'Avg shot speed', value: '90–100 mph' },
      { label: 'Overtime', value: '5-min 3-on-3, then shootout' },
    ],
    positions: [
      { id: 'G', name: 'Goalie', abbr: 'G', x: 50, y: 88, role: 'Guards the 4×6 ft net. Must stop pucks shot at 90+ mph. The most important position — a hot goalie can carry a team.', key: ['Reflexes', 'Positioning', 'Puck-handling'] },
      { id: 'LD', name: 'Left Defense', abbr: 'LD', x: 30, y: 68, role: 'One of two defensemen who protect their own zone. Must be strong enough to clear players from the crease and smart enough to join the rush.', key: ['Physicality', 'Skating', 'Shot blocking'] },
      { id: 'RD', name: 'Right Defense', abbr: 'RD', x: 70, y: 68, role: 'Pairs with the left defenseman. Often the quarterback of the power play, with a booming point shot from the blue line.', key: ['Point shot', 'Defensive awareness', 'Passing'] },
      { id: 'LW', name: 'Left Wing', abbr: 'LW', x: 20, y: 48, role: 'Plays the left side, pressures the puck carrier, and crashes the net for rebounds. Usually one of the team\'s power forwards.', key: ['Net-front presence', 'Forechecking', 'Scoring'] },
      { id: 'C', name: 'Center', abbr: 'C', x: 50, y: 48, role: 'The playmaker of the line. Takes faceoffs, drives the middle of the ice, and sets up scoring chances for the wings.', key: ['Faceoffs', 'Playmaking', 'Two-way play'] },
      { id: 'RW', name: 'Right Wing', abbr: 'RW', x: 80, y: 48, role: 'The classic sniper position. Positions for one-timers and tips. Often the pure goal scorer on the line.', key: ['Shooting', 'Positioning', 'Speed'] },
    ],
    scoringRules: [
      { name: 'Goal', points: '1 pt', description: 'The puck completely crosses the goal line inside the net. A video review system confirms disputed goals.', icon: '🚨' },
      { name: 'Assist', points: 'Stat only', description: 'Up to 2 players who passed the puck to the goal-scorer receive assists. Assists count toward points (G+A) in player stats.', icon: '🎯' },
      { name: 'Power Play Goal', points: '1 pt', description: 'Goal scored while the other team has a player in the penalty box (5-on-4). Power plays are the highest-scoring situations in hockey.', icon: '⚡' },
      { name: 'Penalty Shot', points: '1 pt (if scored)', description: 'Awarded when a player on a breakaway is illegally tripped. They skate in alone against the goalie — one chance to score.', icon: '🎳' },
    ],
    keyRules: [
      { title: 'Offsides', description: 'All attacking players must enter the offensive zone behind the puck. If an attacker enters before the puck, play is blown dead and a faceoff occurs at the blue line.' },
      { title: 'Icing', description: 'Shooting the puck from your side of center ice all the way down without it being touched is icing. Results in a faceoff in the offending team\'s zone.' },
      { title: 'Penalties', description: 'Physical fouls (hooking, slashing, tripping, etc.) send a player to the penalty box for 2 minutes, leaving their team shorthanded.' },
      { title: 'Line Changes', description: 'Players can be substituted "on the fly" without stopping play, as long as the player leaving the ice is near the bench. This allows fresh legs constantly.' },
      { title: 'Faceoff', description: 'The referee drops the puck between two opposing centers. Faceoffs start each period, follow goals, and restart play after stoppages.' },
      { title: 'Delayed Penalty', description: 'When the team with the advantage has possession, refs raise their hand but wait to blow the whistle — allowing the play to finish (often for a shot or goal).' },
    ],
    strategies: [
      { name: 'Dump and Chase', side: 'offense', description: 'Shoot (dump) the puck into the offensive zone then race in to retrieve it. Used when the defense won\'t allow clean entry.' },
      { name: 'Power Play (Umbrella)', side: 'offense', description: 'On a 5-on-4 power play, set up in a 1-3-1 formation (umbrella). One player at the point, three across the middle, one at the net.' },
      { name: 'Cycle Game', side: 'offense', description: 'Keep possession in the offensive zone by passing the puck behind the net and along the boards, waiting for a teammate to get open in the slot.' },
      { name: '1-2-2 Forecheck', side: 'defense', description: 'One forward leads the pressure, two forwards support, two defensemen hold the blue line. Aggressive but organized forecheck.' },
      { name: 'Neutral Zone Trap', side: 'defense', description: 'Clog the neutral zone with 4 players and one forechecker, forcing turnovers and preventing entry into the offensive zone.' },
      { name: 'Penalty Kill (Box)', side: 'defense', description: 'Four players form a box in front of their own net while shorthanded. Focus on clearing the zone and blocking the passing lanes.' },
    ],
  },

  FIFA: {
    name: 'Soccer', league: 'FIFA / Global', tagline: 'Score more goals than your opponent in 90 minutes',
    color: '#1B6B3A', accent: '#FFFFFF',
    overview: `Soccer (football outside North America) is the world's most popular sport, played in 200+ countries. Two teams of 11 players use their feet (and head) to kick a ball into the opponent's goal — no hands allowed except for the goalkeeper. A match lasts 90 minutes (2 halves of 45), plus stoppage time. The simplicity of the rules and the low-scoring drama make every goal feel monumental.`,
    objective: 'Score more goals than the opponent by kicking or heading the ball into their net.',
    quickFacts: [
      { label: 'Players per side', value: '11' },
      { label: 'Match length', value: '2 × 45 min + stoppage' },
      { label: 'Substitutions', value: '5 per game' },
      { label: 'Field size', value: '100–110m × 64–75m' },
      { label: 'Goal size', value: '7.32m × 2.44m' },
      { label: 'Ball circumference', value: '68–70 cm' },
    ],
    positions: [
      { id: 'GK', name: 'Goalkeeper', abbr: 'GK', x: 50, y: 90, role: 'The only player who can use their hands (inside the penalty area). The last line of defense and the team\'s emotional anchor.', key: ['Shot stopping', 'Distribution', 'Command of area'] },
      { id: 'CB', name: 'Center Back', abbr: 'CB', x: 50, y: 76, role: 'The rock of the defense. Wins aerial duels, makes last-ditch tackles, and organizes the defensive line. Usually played in pairs.', key: ['Heading', 'Tackling', 'Leadership'] },
      { id: 'LB', name: 'Left Back', abbr: 'LB', x: 25, y: 72, role: 'Defends the left flank and overlaps forward to support attacks. Modern fullbacks are expected to be attacking threats.', key: ['Crossing', 'Defending 1v1', 'Stamina'] },
      { id: 'RB', name: 'Right Back', abbr: 'RB', x: 75, y: 72, role: 'Mirrors the left back on the right side. In modern football, attacking fullbacks are highly valued for their ability to create width.', key: ['Crossing', 'Defending', 'Overlapping runs'] },
      { id: 'CM', name: 'Central Midfielder', abbr: 'CM', x: 50, y: 55, role: 'The engine room of the team. Can be a defensive midfielder (DM) who shields the defense or an attacking midfielder (AM) who creates chances.', key: ['Passing range', 'Ball retention', 'Work rate'] },
      { id: 'LM', name: 'Left Midfielder', abbr: 'LM', x: 20, y: 50, role: 'Provides width on the left side. Crosses, dribbles, and presses the opposition\'s right back. Often a fast, direct winger.', key: ['Dribbling', 'Crossing', 'Pressing'] },
      { id: 'RM', name: 'Right Midfielder', abbr: 'RM', x: 80, y: 50, role: 'Provides width on the right. An inverted winger (left-footed on the right) can cut inside to shoot. Think Messi early in his career.', key: ['Pace', 'Cutting inside', 'Assist'] },
      { id: 'ST', name: 'Striker', abbr: 'ST', x: 50, y: 35, role: 'The primary goal-scorer. Must be clinical in front of goal and hold up the ball. Can be a target man (tall/physical) or a poacher (smart positioning).', key: ['Finishing', 'Movement', 'Composure'] },
    ],
    scoringRules: [
      { name: 'Goal', points: '1 pt', description: 'The ball completely crosses the goal line between the posts and under the crossbar. Even if scored accidentally (own goal), it counts.', icon: '⚽' },
      { name: 'Penalty Kick', points: '1 pt (if scored)', description: 'Awarded when a foul occurs inside the penalty box. Shot taken 1v1 from the penalty spot (12 yards). ~76% conversion rate in top leagues.', icon: '🎯' },
      { name: 'Header', points: '1 pt', description: 'A goal scored by redirecting the ball with the head — typically from a corner kick or cross. A core skill for tall attackers.', icon: '🤩' },
      { name: 'Free Kick (Direct)', points: '1 pt (if scored)', description: 'Awarded after a foul. The attacking team can shoot directly at goal. Top players curve these around the wall with tremendous skill.', icon: '🌀' },
    ],
    keyRules: [
      { title: 'Offside', description: 'An attacking player cannot receive the ball if they are closer to the opponent\'s goal line than both the ball and the second-to-last defender. Checked at the moment the pass is made.' },
      { title: 'Yellow & Red Cards', description: 'Yellow = caution/warning. Two yellows = red card = ejection. A straight red card is given for violent conduct. Team plays a man down for the remainder of the match.' },
      { title: 'Throw-In', description: 'When the ball goes out of bounds over the touchline, the opposing team restores play with a two-handed throw from behind the head.' },
      { title: 'Corner Kick', description: 'When the defending team puts the ball out over their own goal line, the attacking team gets a corner kick from the corner arc. A prime set-piece scoring opportunity.' },
      { title: 'Goal Kick', description: 'When the attacking team sends the ball over the defending team\'s goal line (without scoring), the goalkeeper restarts with a kick from inside the goal box.' },
      { title: 'VAR (Video Review)', description: 'Video Assistant Referee system reviews goals, red cards, penalties, and mistaken identity. Used in top competitions to correct clear and obvious errors.' },
    ],
    strategies: [
      { name: 'Tiki-Taka', side: 'offense', description: 'Short, quick passes to maintain possession and tire out the opponent. Pioneered by FC Barcelona and Spain. Requires technically gifted players throughout.' },
      { name: 'Counter-Attack', side: 'offense', description: 'Defend deep, win the ball, then spring fast forwards into space with quick vertical passes. Devastatingly effective against high defensive lines.' },
      { name: 'High Press', side: 'defense', description: 'Pressing the opponent high up the pitch immediately after losing the ball. Forces errors in dangerous areas. Made famous by Klopp\'s Liverpool (gegenpressing).' },
      { name: 'Low Block', side: 'defense', description: 'Park most players deep behind the ball in a compact defensive shape, conceding possession but making it hard to create chances. Frustrating to play against.' },
      { name: 'False 9', side: 'offense', description: 'Instead of a traditional striker, a creative player drops into midfield to create space, pulling center backs out of position. Messi perfected this role.' },
      { name: 'Set Piece Routines', side: 'offense', description: 'Choreographed corner kick and free kick routines. Teams spend significant training time designing plays to create open shots. About 25–30% of goals come from set pieces.' },
    ],
  },

  MLS: {
    name: 'Football', league: 'MLS', tagline: 'Score more goals than your opponent in 90 minutes',
    color: '#002B5C', accent: '#C41230',
    overview: `Major League Soccer is North America's top professional football league, growing rapidly since its founding in 1996. MLS now has 29 teams across the US and Canada, playing the same rules as FIFA. The league has attracted global stars and is developing homegrown talent at an unprecedented rate. Games feature passionate supporter sections and intense rivalries.`,
    objective: 'Score more goals than the opponent by kicking or heading the ball into their net.',
    quickFacts: [
      { label: 'Teams', value: '29 clubs' },
      { label: 'Season', value: 'Feb – Nov' },
      { label: 'Players per side', value: '11' },
      { label: 'Match length', value: '2 × 45 min' },
      { label: 'MLS Cup', value: 'Championship game' },
      { label: 'Founded', value: '1996' },
    ],
    positions: [],
    scoringRules: [],
    keyRules: [],
    strategies: [],
  },
};

// MLS shares soccer rules/positions with FIFA
(SPORT_DATA.MLS as SportData).positions = SPORT_DATA.FIFA.positions;
(SPORT_DATA.MLS as SportData).scoringRules = SPORT_DATA.FIFA.scoringRules;
(SPORT_DATA.MLS as SportData).keyRules = SPORT_DATA.FIFA.keyRules;
(SPORT_DATA.MLS as SportData).strategies = SPORT_DATA.FIFA.strategies;

// ─────────────────────────────────────────────────────────────────────────────
// SVG COURTS / FIELDS
// ─────────────────────────────────────────────────────────────────────────────

function BasketballCourt({ highlightZone }: { highlightZone?: string }) {
  return (
    <svg viewBox="0 0 400 240" className="w-full max-w-lg mx-auto" style={{ fontFamily: 'inherit' }}>
      {/* Court floor */}
      <rect x="10" y="10" width="380" height="220" rx="8" fill="#C68642" stroke="#8B5E3C" strokeWidth="2" />
      {/* Court lines */}
      <rect x="10" y="10" width="380" height="220" rx="8" fill="none" stroke="white" strokeWidth="2" />
      {/* Half court */}
      <line x1="200" y1="10" x2="200" y2="230" stroke="white" strokeWidth="1.5" />
      {/* Center circle */}
      <circle cx="200" cy="120" r="30" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Left paint */}
      <rect x="10" y="76" width="80" height="88" fill={highlightZone === 'paint' ? '#C9082A44' : '#00000020'} stroke="white" strokeWidth="1.5" />
      {/* Left free throw circle */}
      <path d="M 90 76 A 40 40 0 0 1 90 164" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Left 3-point arc */}
      <path d="M 10 60 L 60 60 A 140 140 0 0 1 60 180 L 10 180" fill={highlightZone === '3pt' ? '#17408B33' : 'none'} stroke="white" strokeWidth="1.5" />
      {/* Left basket */}
      <circle cx="43" cy="120" r="9" fill="none" stroke="#FF6B00" strokeWidth="2" />
      <line x1="10" y1="120" x2="43" y2="120" stroke="#FF6B00" strokeWidth="1.5" strokeDasharray="3 2" />
      {/* Right paint */}
      <rect x="310" y="76" width="80" height="88" fill="#00000020" stroke="white" strokeWidth="1.5" />
      <path d="M 310 76 A 40 40 0 0 0 310 164" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M 390 60 L 340 60 A 140 140 0 0 0 340 180 L 390 180" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="357" cy="120" r="9" fill="none" stroke="#FF6B00" strokeWidth="2" />
      <line x1="390" y1="120" x2="357" y2="120" stroke="#FF6B00" strokeWidth="1.5" strokeDasharray="3 2" />
      {/* Labels */}
      <text x="50" y="106" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" opacity="0.7">PAINT</text>
      <text x="50" y="116" textAnchor="middle" fill="white" fontSize="6" opacity="0.5">(Key)</text>
      <text x="28" y="50" textAnchor="middle" fill="white" fontSize="6" opacity="0.7">3-PT</text>
      <text x="200" y="115" textAnchor="middle" fill="white" fontSize="7" opacity="0.5">MID</text>
      <text x="200" y="125" textAnchor="middle" fill="white" fontSize="7" opacity="0.5">COURT</text>
    </svg>
  );
}

function FootballField({ highlightZone }: { highlightZone?: string }) {
  const endZoneColor = highlightZone === 'endzone' ? '#D50A0A44' : '#013369';
  return (
    <svg viewBox="0 0 420 200" className="w-full max-w-lg mx-auto">
      <rect x="5" y="5" width="410" height="190" rx="4" fill="#2D6A2D" />
      {/* End zones */}
      <rect x="5" y="5" width="45" height="190" rx="4" fill={endZoneColor} stroke="white" strokeWidth="1" />
      <rect x="370" y="5" width="45" height="190" rx="4" fill={endZoneColor} stroke="white" strokeWidth="1" />
      <text x="27" y="105" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" transform="rotate(-90, 27, 105)">END ZONE</text>
      <text x="393" y="105" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" transform="rotate(90, 393, 105)">END ZONE</text>
      {/* Yard lines every 10 yards */}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yard, i) => {
        const x = 50 + (i * 36);
        return (
          <g key={yard}>
            <line x1={x} y1="5" x2={x} y2="195" stroke="white" strokeWidth={yard === 50 ? 2 : 0.8} opacity={yard === 50 ? 1 : 0.6} />
            <text x={x} y="20" textAnchor="middle" fill="white" fontSize="6" opacity="0.8">
              {yard <= 50 ? yard : 100 - yard}
            </text>
          </g>
        );
      })}
      {/* Hash marks */}
      {[...Array(9)].map((_, i) => {
        const x = 50 + i * 36;
        return (
          <g key={i}>
            <line x1={x - 3} y1="75" x2={x + 3} y2="75" stroke="white" strokeWidth="0.8" opacity="0.5" />
            <line x1={x - 3} y1="125" x2={x + 3} y2="125" stroke="white" strokeWidth="0.8" opacity="0.5" />
          </g>
        );
      })}
      {/* Uprights */}
      <line x1="27" y1="40" x2="27" y2="70" stroke="#FFD700" strokeWidth="2" />
      <line x1="18" y1="40" x2="36" y2="40" stroke="#FFD700" strokeWidth="2" />
      <line x1="18" y1="35" x2="18" y2="40" stroke="#FFD700" strokeWidth="1.5" />
      <line x1="36" y1="35" x2="36" y2="40" stroke="#FFD700" strokeWidth="1.5" />
      <line x1="393" y1="40" x2="393" y2="70" stroke="#FFD700" strokeWidth="2" />
      <line x1="384" y1="40" x2="402" y2="40" stroke="#FFD700" strokeWidth="2" />
    </svg>
  );
}

function BaseballDiamond() {
  return (
    <svg viewBox="0 0 300 280" className="w-full max-w-sm mx-auto">
      {/* Outfield grass */}
      <path d="M 150 260 L 30 100 A 170 170 0 0 1 270 100 Z" fill="#2D7A2D" />
      {/* Infield dirt */}
      <path d="M 150 245 L 60 155 L 150 65 L 240 155 Z" fill="#C68642" />
      {/* Infield grass */}
      <circle cx="150" cy="155" r="55" fill="#2D7A2D" opacity="0.6" />
      {/* Foul lines */}
      <line x1="150" y1="245" x2="30" y2="90" stroke="white" strokeWidth="1" opacity="0.7" />
      <line x1="150" y1="245" x2="270" y2="90" stroke="white" strokeWidth="1" opacity="0.7" />
      {/* Bases */}
      <rect x="141" y="58" width="18" height="18" fill="white" rx="2" transform="rotate(45, 150, 67)" /> {/* 2nd */}
      <rect x="51" y="147" width="18" height="18" fill="white" rx="2" transform="rotate(45, 60, 156)" /> {/* 3rd */}
      <rect x="231" y="147" width="18" height="18" fill="white" rx="2" transform="rotate(45, 240, 156)" /> {/* 1st */}
      <rect x="141" y="236" width="18" height="18" fill="#FF8C00" rx="2" transform="rotate(45, 150, 245)" /> {/* Home */}
      {/* Pitcher's mound */}
      <circle cx="150" cy="155" r="8" fill="#B8860B" stroke="white" strokeWidth="1" />
      {/* Base labels */}
      <text x="150" y="50" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">2nd</text>
      <text x="36" y="172" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">3rd</text>
      <text x="264" y="172" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">1st</text>
      <text x="150" y="275" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">Home</text>
      <text x="150" y="162" textAnchor="middle" fill="white" fontSize="7" opacity="0.8">P</text>
    </svg>
  );
}

function HockeyRink() {
  return (
    <svg viewBox="0 0 400 200" className="w-full max-w-lg mx-auto">
      <rect x="5" y="5" width="390" height="190" rx="30" fill="#D4F1FF" stroke="#333" strokeWidth="2" />
      {/* Red center line */}
      <line x1="200" y1="5" x2="200" y2="195" stroke="#CC0000" strokeWidth="2.5" />
      {/* Blue lines */}
      <line x1="120" y1="5" x2="120" y2="195" stroke="#0033CC" strokeWidth="2" />
      <line x1="280" y1="5" x2="280" y2="195" stroke="#0033CC" strokeWidth="2" />
      {/* Center faceoff circle */}
      <circle cx="200" cy="100" r="35" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <circle cx="200" cy="100" r="3" fill="#CC0000" />
      {/* Left faceoff circles */}
      <circle cx="75" cy="60" r="20" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <circle cx="75" cy="60" r="3" fill="#CC0000" />
      <circle cx="75" cy="140" r="20" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <circle cx="75" cy="140" r="3" fill="#CC0000" />
      {/* Right faceoff circles */}
      <circle cx="325" cy="60" r="20" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <circle cx="325" cy="60" r="3" fill="#CC0000" />
      <circle cx="325" cy="140" r="20" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <circle cx="325" cy="140" r="3" fill="#CC0000" />
      {/* Goal creases */}
      <rect x="5" y="82" width="20" height="36" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <path d="M 25 82 A 25 25 0 0 1 25 118" fill="#6699FF33" stroke="#CC0000" strokeWidth="1.5" />
      <rect x="375" y="82" width="20" height="36" fill="none" stroke="#CC0000" strokeWidth="1.5" />
      <path d="M 375 82 A 25 25 0 0 0 375 118" fill="#6699FF33" stroke="#CC0000" strokeWidth="1.5" />
      {/* Labels */}
      <text x="65" y="105" textAnchor="middle" fill="#003" fontSize="7" fontWeight="bold">DEF ZONE</text>
      <text x="200" y="75" textAnchor="middle" fill="#003" fontSize="7" fontWeight="bold">NEUTRAL</text>
      <text x="335" y="105" textAnchor="middle" fill="#003" fontSize="7" fontWeight="bold">ATT ZONE</text>
    </svg>
  );
}

function SoccerPitch() {
  return (
    <svg viewBox="0 0 400 260" className="w-full max-w-lg mx-auto">
      <rect x="5" y="5" width="390" height="250" rx="4" fill="#2D7A2D" />
      {/* Outer border */}
      <rect x="15" y="15" width="370" height="230" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Center line */}
      <line x1="200" y1="15" x2="200" y2="245" stroke="white" strokeWidth="1.5" />
      {/* Center circle */}
      <circle cx="200" cy="130" r="40" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="200" cy="130" r="3" fill="white" />
      {/* Left penalty box */}
      <rect x="15" y="72" width="65" height="116" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Left goal box */}
      <rect x="15" y="100" width="22" height="60" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Left penalty spot */}
      <circle cx="60" cy="130" r="2.5" fill="white" />
      {/* Left penalty arc */}
      <path d="M 80 105 A 40 40 0 0 1 80 155" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Left goal */}
      <rect x="5" y="111" width="10" height="38" fill="none" stroke="white" strokeWidth="2" />
      {/* Right side mirrors */}
      <rect x="320" y="72" width="65" height="116" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="363" y="100" width="22" height="60" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="340" cy="130" r="2.5" fill="white" />
      <path d="M 320 105 A 40 40 0 0 0 320 155" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="385" y="111" width="10" height="38" fill="none" stroke="white" strokeWidth="2" />
      {/* Corner arcs */}
      <path d="M 15 25 A 8 8 0 0 1 23 15" fill="none" stroke="white" strokeWidth="1" />
      <path d="M 377 15 A 8 8 0 0 1 385 25" fill="none" stroke="white" strokeWidth="1" />
      <path d="M 15 235 A 8 8 0 0 0 23 245" fill="none" stroke="white" strokeWidth="1" />
      <path d="M 377 245 A 8 8 0 0 0 385 235" fill="none" stroke="white" strokeWidth="1" />
    </svg>
  );
}

function FieldComponent({ league }: { league: SportLeague }) {
  if (league === 'NBA') return <BasketballCourt />;
  if (league === 'NFL') return <FootballField />;
  if (league === 'MLB') return <BaseballDiamond />;
  if (league === 'NHL') return <HockeyRink />;
  return <SoccerPitch />;
}

// ─────────────────────────────────────────────────────────────────────────────
// POSITION MAP
// ─────────────────────────────────────────────────────────────────────────────

function PositionMap({ league, positions, selectedPos, onSelect }: {
  league: SportLeague; positions: Position[]; selectedPos: string | null; onSelect: (id: string) => void;
}) {
  const FieldBg = () => {
    if (league === 'NBA') return <BasketballCourt highlightZone={undefined} />;
    if (league === 'NFL') return <FootballField />;
    if (league === 'MLB') return <BaseballDiamond />;
    if (league === 'NHL') return <HockeyRink />;
    return <SoccerPitch />;
  };

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <FieldBg />
      <div className="absolute inset-0">
        {positions.map(pos => (
          <button
            key={pos.id}
            onClick={() => onSelect(pos.id)}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200"
          >
            <motion.div
              whileTap={{ scale: 0.9 }}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-black border-2 shadow-lg transition-all ${
                selectedPos === pos.id
                  ? 'bg-[--small-orange] border-white text-white scale-125'
                  : 'bg-black/70 border-white/50 text-white hover:border-white hover:bg-black/90'
              }`}
            >
              {pos.abbr}
            </motion.div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATIONS
// ─────────────────────────────────────────────────────────────────────────────

/* ── BASKETBALL SIMULATION ── */
interface BballState {
  teamScore: number; aiScore: number; quarter: number; timeLeft: number;
  possession: 'team' | 'ai'; log: string[]; gameOver: boolean; shotClock: number;
}
type BballAction =
  | { type: 'SHOOT_3' } | { type: 'SHOOT_2' } | { type: 'DRIVE' }
  | { type: 'AI_TURN' } | { type: 'RESET' };

function bballReducer(state: BballState, action: BballAction): BballState {
  if (action.type === 'RESET') return initBball();
  if (state.gameOver || state.possession === 'ai') return state;

  const rand = () => Math.random();
  let { teamScore, aiScore, quarter, timeLeft, log } = state;

  const addTime = (secs: number) => {
    let t = timeLeft - secs;
    let q = quarter;
    if (t <= 0 && q < 4) { q++; t = 720; }
    else if (t <= 0) return { timeLeft: 0, quarter: 4, gameOver: true };
    return { timeLeft: t, quarter: q, gameOver: false };
  };

  let msg = '';
  let made = false;
  let pts = 0;

  if (action.type === 'SHOOT_3') {
    made = rand() < 0.36;
    if (made) { pts = 3; teamScore += 3; msg = '🎯 Three-pointer! +3'; }
    else msg = '😤 3-pointer off the mark. Defensive rebound.';
  } else if (action.type === 'SHOOT_2') {
    made = rand() < 0.52;
    if (made) { pts = 2; teamScore += 2; msg = '🏀 Bucket! +2'; }
    else msg = '😤 Missed 2. Defensive rebound.';
  } else if (action.type === 'DRIVE') {
    const outcome = rand();
    if (outcome < 0.45) { pts = 2; teamScore += 2; msg = '💨 And-1 drive! +2'; made = true; }
    else if (outcome < 0.65) { teamScore += 2; msg = '⚡ Foul! Made both free throws. +2'; made = true; pts = 2; }
    else msg = '🚫 Charge called! Turnover.';
  }

  const timeSpent = 8 + Math.floor(rand() * 16);
  const timing = addTime(timeSpent);
  const newLog = [msg, ...log].slice(0, 6);

  // AI turn after
  const aiResult = simulateAIBball(aiScore, timing.timeLeft);
  return {
    ...state, teamScore, aiScore: aiResult.score, quarter: timing.quarter,
    timeLeft: timing.timeLeft, gameOver: timing.gameOver || (timing.quarter === 4 && timing.timeLeft <= 0),
    possession: 'team', log: [aiResult.msg, ...newLog].slice(0, 6), shotClock: 24,
  };

  function simulateAIBball(score: number, tl: number) {
    const r = rand();
    if (r < 0.48) return { score: score + 2, msg: '🤖 AI scores 2. Tied up!' };
    if (r < 0.64) return { score: score + 3, msg: '🤖 AI drains a three!' };
    return { score, msg: '✅ AI bricked it. Your ball.' };
  }
}
function initBball(): BballState {
  return { teamScore: 0, aiScore: 0, quarter: 1, timeLeft: 720, possession: 'team', log: ['Tip-off! You have possession. Make a move.'], gameOver: false, shotClock: 24 };
}

function BasketballSim() {
  const [state, dispatch] = useReducer(bballReducer, undefined, initBball);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-[--small-orange] text-3xl font-black">{state.teamScore}</div>
          <div className="text-white/40 text-[10px] font-bold uppercase tracking-wider">You</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-white text-sm font-bold">Q{state.quarter}</div>
          <div className="text-white text-xl font-black">{fmt(state.timeLeft)}</div>
          <div className="text-white/40 text-[9px]">Shot clock: {state.shotClock}s</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-red-400 text-3xl font-black">{state.aiScore}</div>
          <div className="text-white/40 text-[10px] font-bold uppercase tracking-wider">CPU</div>
        </div>
      </div>

      {/* Play log */}
      <div className="bg-black/40 rounded-2xl p-3 border border-white/5 min-h-[80px] space-y-1">
        {state.log.map((l, i) => (
          <motion.p key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1 - i * 0.15, x: 0 }}
            className="text-xs text-white/80" style={{ opacity: Math.max(0.2, 1 - i * 0.18) }}>{l}</motion.p>
        ))}
      </div>

      {state.gameOver ? (
        <div className="text-center space-y-3">
          <div className={`text-2xl font-black ${state.teamScore > state.aiScore ? 'text-green-400' : state.teamScore < state.aiScore ? 'text-red-400' : 'text-yellow-400'}`}>
            {state.teamScore > state.aiScore ? '🏆 You Win!' : state.teamScore < state.aiScore ? '😤 CPU Wins' : '🤝 Tie Game'}
          </div>
          <button onClick={() => dispatch({ type: 'RESET' })}
            className="flex items-center gap-2 mx-auto bg-[--small-orange] text-white font-bold px-5 py-2.5 rounded-xl text-sm">
            <RotateCcw size={14} /> Play Again
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider text-center">Choose your play</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '3-Point Shot', desc: '36% make', action: 'SHOOT_3' as const, color: 'bg-blue-600' },
              { label: '2-Point Shot', desc: '52% make', action: 'SHOOT_2' as const, color: 'bg-green-600' },
              { label: 'Drive to Basket', desc: 'Foul risk', action: 'DRIVE' as const, color: 'bg-purple-600' },
            ].map(p => (
              <motion.button key={p.action} whileTap={{ scale: 0.95 }} onClick={() => dispatch({ type: p.action })}
                className={`${p.color} text-white rounded-xl p-3 text-center`}>
                <div className="text-xs font-black">{p.label}</div>
                <div className="text-[9px] opacity-70 mt-0.5">{p.desc}</div>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── FOOTBALL SIMULATION ── */
interface FballState {
  teamScore: number; aiScore: number; quarter: number; timeLeft: number;
  down: number; yardsToGo: number; fieldPosition: number; possession: 'team' | 'ai';
  log: string[]; gameOver: boolean;
}

function initFball(): FballState {
  return { teamScore: 0, aiScore: 0, quarter: 1, timeLeft: 900, down: 1, yardsToGo: 10, fieldPosition: 25, possession: 'team', log: ['Kickoff! You receive at the 25. 1st & 10.'], gameOver: false };
}

function FootballSim() {
  const [state, setState] = useState<FballState>(initFball());

  const runPlay = (play: string) => {
    if (state.gameOver || state.possession === 'ai') return;
    const r = Math.random();
    let yards = 0; let msg = '';

    if (play === 'RUN') {
      yards = Math.floor(r < 0.15 ? -2 + r * 10 : r < 0.7 ? r * 12 : 15 + r * 10);
      if (r < 0.05) { msg = `💨 Fumble! CPU recovers.`; switchPossession(state); return; }
      msg = yards >= 10 ? `🏃 ${yards}-yard run! First down!` : `🏃 ${yards}-yard gain.`;
    } else if (play === 'SHORT_PASS') {
      if (r < 0.25) { msg = '🚫 Incomplete pass.'; yards = 0; }
      else if (r < 0.08) { msg = '🚨 Interception! CPU ball.'; switchPossession(state); return; }
      else { yards = 5 + Math.floor(r * 10); msg = `🎯 Completion! ${yards}-yard gain.`; }
    } else if (play === 'DEEP_PASS') {
      if (r < 0.5) { msg = '😤 Incomplete deep ball.'; yards = 0; }
      else if (r < 0.6) { msg = '🚨 Interception going deep!'; switchPossession(state); return; }
      else { yards = 20 + Math.floor(r * 30); msg = `🚀 Big gain! ${yards} yards!`; }
    } else if (play === 'FIELD_GOAL') {
      const dist = 100 - state.fieldPosition + 17;
      const make = r > (dist - 30) * 0.025;
      if (make) { setState(s => ({ ...s, teamScore: s.teamScore + 3, log: [`⚡ ${dist}-yd FG is GOOD! +3`, ...s.log].slice(0, 6), down: 1, yardsToGo: 10, fieldPosition: 25, possession: 'team' })); aiTurn(); return; }
      else { msg = `💨 ${dist}-yd FG no good. CPU ball.`; switchPossession(state); return; }
    }

    setState(s => {
      let fp = s.fieldPosition + yards;
      let { down, yardsToGo, teamScore, quarter, timeLeft } = s;
      const newLog = [msg, ...s.log].slice(0, 6);

      if (fp >= 100) {
        teamScore += 6;
        return { ...s, teamScore, fieldPosition: 25, down: 1, yardsToGo: 10, log: ['🏈 TOUCHDOWN! +6', ...newLog].slice(0, 6) };
      }

      const yardsMade = yards;
      const newYTG = yardsToGo - yardsMade;
      if (newYTG <= 0) { return { ...s, fieldPosition: fp, down: 1, yardsToGo: 10, timeLeft: Math.max(0, timeLeft - 35), log: newLog }; }
      if (down < 4) { return { ...s, fieldPosition: fp, down: down + 1, yardsToGo: newYTG, timeLeft: Math.max(0, timeLeft - 35), log: newLog }; }

      // 4th down punt
      const puntMsg = '⬆️ Punting. CPU gets the ball.';
      return { ...s, fieldPosition: 75, down: 1, yardsToGo: 10, possession: 'ai', log: [puntMsg, ...newLog].slice(0, 6) };
    });

    setTimeout(() => aiTurn(), 800);
  };

  const aiTurn = () => {
    setState(s => {
      if (s.possession !== 'ai') return s;
      const r = Math.random();
      const aiYards = r < 0.4 ? 3 + Math.floor(r * 8) : r < 0.7 ? 0 : 15 + Math.floor(r * 15);
      const aiScore = s.aiScore + (r > 0.9 ? 6 : r > 0.75 ? 3 : 0);
      const aiMsg = r > 0.9 ? '🤖 CPU scores a TD! +6' : r > 0.75 ? '🤖 CPU kicks a FG. +3' : `🤖 CPU gains ${aiYards} yds. Your ball.`;
      return { ...s, possession: 'team', aiScore, fieldPosition: 25, down: 1, yardsToGo: 10, log: [aiMsg, ...s.log].slice(0, 6) };
    });
  };

  const switchPossession = (s: FballState) => {
    setState(prev => ({ ...prev, possession: 'ai' }));
    setTimeout(() => aiTurn(), 800);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-[--small-orange] text-3xl font-black">{state.teamScore}</div>
          <div className="text-white/40 text-[10px] font-bold uppercase">You</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-white text-xs font-bold">Q{state.quarter}</div>
          <div className="text-white font-black">{fmt(state.timeLeft)}</div>
          <div className="text-[--small-orange] text-[9px] font-bold">{state.down === 1 ? '1st' : state.down === 2 ? '2nd' : state.down === 3 ? '3rd' : '4th'} & {state.yardsToGo}</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-red-400 text-3xl font-black">{state.aiScore}</div>
          <div className="text-white/40 text-[10px] font-bold uppercase">CPU</div>
        </div>
      </div>
      {/* Field position bar */}
      <div className="h-3 bg-white/5 rounded-full overflow-hidden">
        <motion.div animate={{ width: `${state.fieldPosition}%` }} className="h-full bg-[--small-orange] rounded-full" />
      </div>
      <p className="text-white/40 text-[10px] text-center">Ball at CPU {100 - state.fieldPosition} · {state.fieldPosition >= 60 ? '🏈 Field goal range' : ''}</p>
      {/* Log */}
      <div className="bg-black/40 rounded-2xl p-3 border border-white/5 min-h-[80px] space-y-1">
        {state.log.map((l, i) => <p key={i} className="text-xs" style={{ opacity: Math.max(0.2, 1 - i * 0.18), color: 'white' }}>{l}</p>)}
      </div>
      {/* Play buttons */}
      <div className="space-y-2">
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider text-center">Call a play</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '🏃 Run Play', desc: 'Reliable yardage', action: 'RUN' },
            { label: '🎯 Short Pass', desc: 'Safe, 5-15 yds', action: 'SHORT_PASS' },
            { label: '🚀 Deep Pass', desc: 'High risk/reward', action: 'DEEP_PASS' },
            { label: '⚡ Field Goal', desc: state.fieldPosition >= 60 ? 'In range!' : 'Too far back', action: 'FIELD_GOAL' },
          ].map(p => (
            <motion.button key={p.action} whileTap={{ scale: 0.95 }}
              disabled={state.possession !== 'team'}
              onClick={() => runPlay(p.action)}
              className={`rounded-xl p-3 text-center border transition-all ${state.possession !== 'team' ? 'opacity-40 bg-white/3 border-white/5' : 'bg-white/8 border-white/15 hover:border-[--small-orange]/50'}`}>
              <div className="text-xs font-black text-white">{p.label}</div>
              <div className="text-[9px] text-white/40 mt-0.5">{p.desc}</div>
            </motion.button>
          ))}
        </div>
        <button onClick={() => setState(initFball())}
          className="w-full text-white/30 text-xs py-2 flex items-center justify-center gap-1 hover:text-white/60 transition-colors">
          <RotateCcw size={12} /> Reset Game
        </button>
      </div>
    </div>
  );
}

/* ── BASEBALL SIMULATION ── */
interface BaseballState {
  teamRuns: number; aiRuns: number; inning: number; outs: number;
  balls: number; strikes: number; bases: [boolean, boolean, boolean];
  possession: 'batting' | 'fielding'; log: string[]; gameOver: boolean;
}

function initBaseball(): BaseballState {
  return { teamRuns: 0, aiRuns: 0, inning: 1, outs: 0, balls: 0, strikes: 0, bases: [false, false, false], possession: 'batting', log: ['Top of 1st — you\'re up to bat! 0-0 count.'], gameOver: false };
}

function BaseballSim() {
  const [state, setState] = useState<BaseballState>(initBaseball());

  const atBat = (choice: 'SWING' | 'TAKE') => {
    if (state.gameOver || state.possession !== 'batting') return;
    const r = Math.random();
    setState(s => {
      let { teamRuns, balls, strikes, outs, bases, inning, log, aiRuns } = s;

      if (choice === 'TAKE') {
        if (r < 0.55) { // ball
          const newBalls = balls + 1;
          if (newBalls >= 4) return { ...s, balls: 0, strikes: 0, bases: advance(bases, 1, false), log: ['🚶 Walk! Ball four. Take your base.', ...log].slice(0, 6) };
          return { ...s, balls: newBalls, log: [`⚾ Ball ${newBalls}. Count: ${newBalls}-${strikes}.`, ...log].slice(0, 6) };
        } else {
          const newStrikes = strikes + 1;
          if (newStrikes >= 3) { const newOuts = outs + 1; return newOuts >= 3 ? endHalfInning(s) : { ...s, strikes: 0, balls: 0, outs: newOuts, log: [`🤚 Called strike three! Out #${newOuts}.`, ...log].slice(0, 6) }; }
          return { ...s, strikes: newStrikes, log: [`🎯 Called strike. Count: ${balls}-${newStrikes}.`, ...log].slice(0, 6) };
        }
      }

      // SWING
      if (r < 0.08) { // homer
        const runs = bases.filter(Boolean).length + 1;
        return { ...s, teamRuns: teamRuns + runs, bases: [false, false, false], balls: 0, strikes: 0, log: [`💥 HOME RUN! +${runs} run${runs > 1 ? 's' : ''}!`, ...log].slice(0, 6) };
      } else if (r < 0.28) { // hit
        const hitType = r < 0.18 ? 'single' : r < 0.23 ? 'double' : 'triple';
        const adv = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;
        const { newBases, runs: scored } = advanceRunners(bases, adv);
        return { ...s, teamRuns: teamRuns + scored, bases: newBases, balls: 0, strikes: 0, log: [`🏏 ${hitType.charAt(0).toUpperCase() + hitType.slice(1)}! ${scored > 0 ? `+${scored} run!` : 'Runner(s) advancing.'}`, ...log].slice(0, 6) };
      } else if (r < 0.38) { // out in play
        const newOuts = outs + 1;
        return newOuts >= 3 ? endHalfInning(s) : { ...s, outs: newOuts, balls: 0, strikes: 0, log: [`🤾 Ground out. ${newOuts} out${newOuts > 1 ? 's' : ''}.`, ...log].slice(0, 6) };
      } else if (r < 0.42) { // strikeout swinging
        const newOuts = outs + 1;
        return newOuts >= 3 ? endHalfInning(s) : { ...s, outs: newOuts, balls: 0, strikes: 0, log: [`💨 Swinging strikeout! ${newOuts} out${newOuts > 1 ? 's' : ''}.`, ...log].slice(0, 6) };
      } else { // foul or miss
        const newStrikes = Math.min(strikes + 1, 2);
        return { ...s, strikes: newStrikes, log: [`Foul ball. Count: ${balls}-${newStrikes}.`, ...log].slice(0, 6) };
      }
    });
  };

  function endHalfInning(s: BaseballState): BaseballState {
    if (s.inning >= 9 && s.possession === 'fielding') {
      return { ...s, gameOver: true, log: ['Game over!', ...s.log].slice(0, 6) };
    }
    if (s.possession === 'batting') {
      // AI bats
      const aiScore = s.inning % 3 === 0 ? 1 : 0;
      return { ...s, outs: 0, balls: 0, strikes: 0, bases: [false, false, false], possession: 'fielding', aiRuns: s.aiRuns + aiScore, log: [`🤖 CPU scores ${aiScore} in the bottom. Your turn to bat again.`, ...s.log].slice(0, 6) };
    }
    return { ...s, outs: 0, balls: 0, strikes: 0, bases: [false, false, false], inning: s.inning + 1, possession: 'batting', log: [`Inning ${s.inning + 1} — you're up!`, ...s.log].slice(0, 6) };
  }

  function advance(bases: [boolean, boolean, boolean], spots: number, batter: boolean): [boolean, boolean, boolean] {
    return [batter, bases[0], bases[1]];
  }

  function advanceRunners(bases: [boolean, boolean, boolean], spots: number): { newBases: [boolean, boolean, boolean]; runs: number } {
    let runs = 0;
    const newB: [boolean, boolean, boolean] = [false, false, false];
    if (spots === 1) {
      if (bases[2]) runs++;
      if (bases[1]) newB[2] = true;
      if (bases[0]) newB[1] = true;
      newB[0] = true;
    } else if (spots === 2) {
      if (bases[2]) runs++;
      if (bases[1]) runs++;
      if (bases[0]) newB[2] = true;
      newB[1] = true;
    } else {
      runs = bases.filter(Boolean).length;
      newB[2] = true;
    }
    return { newBases: newB, runs };
  }

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-[--small-orange] text-3xl font-black">{state.teamRuns}</div>
          <div className="text-white/40 text-[10px]">Your Runs</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10 space-y-1">
          <div className="text-white text-xs font-bold">Inning {state.inning}</div>
          <div className="flex justify-center gap-2">
            <span className="text-white/60 text-xs">{state.outs} Out{state.outs !== 1 ? 's' : ''}</span>
            <span className="text-white/60 text-xs">{state.balls}-{state.strikes}</span>
          </div>
          {/* Bases */}
          <div className="flex justify-center gap-1 pt-1">
            {[state.bases[1], state.bases[2], state.bases[0]].map((on, i) => (
              <div key={i} className={`w-3 h-3 rotate-45 border ${on ? 'bg-[--small-orange] border-[--small-orange]' : 'bg-transparent border-white/30'}`} />
            ))}
          </div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
          <div className="text-red-400 text-3xl font-black">{state.aiRuns}</div>
          <div className="text-white/40 text-[10px]">CPU Runs</div>
        </div>
      </div>
      {/* Log */}
      <div className="bg-black/40 rounded-2xl p-3 border border-white/5 min-h-[80px] space-y-1">
        {state.log.map((l, i) => <p key={i} className="text-xs" style={{ opacity: Math.max(0.2, 1 - i * 0.18), color: 'white' }}>{l}</p>)}
      </div>
      {state.gameOver ? (
        <div className="text-center space-y-3">
          <div className={`text-2xl font-black ${state.teamRuns > state.aiRuns ? 'text-green-400' : 'text-red-400'}`}>
            {state.teamRuns > state.aiRuns ? '🏆 You Win!' : state.teamRuns < state.aiRuns ? '😤 CPU Wins' : '🤝 Tied'}
          </div>
          <button onClick={() => setState(initBaseball())} className="flex items-center gap-2 mx-auto bg-[--small-orange] text-white font-bold px-5 py-2.5 rounded-xl text-sm">
            <RotateCcw size={14} /> Play Again
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider text-center">{state.possession === 'batting' ? 'Your at-bat' : 'CPU batting...'}</p>
          <div className="grid grid-cols-2 gap-2">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => atBat('SWING')} disabled={state.possession !== 'batting'}
              className="bg-[--small-orange] disabled:opacity-40 text-white rounded-xl p-3 font-black text-sm">🏏 Swing!</motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => atBat('TAKE')} disabled={state.possession !== 'batting'}
              className="bg-white/10 disabled:opacity-40 text-white rounded-xl p-3 font-black text-sm border border-white/10">👁 Take (Watch)</motion.button>
          </div>
          <button onClick={() => setState(initBaseball())} className="w-full text-white/30 text-xs py-1 flex items-center justify-center gap-1 hover:text-white/60">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      )}
    </div>
  );
}

function GenericSim({ league }: { league: SportLeague }) {
  const config: Record<string, { emoji: string; msg: string }> = {
    NHL: { emoji: '🏒', msg: 'Pick your moment and release a slap shot — pure power vs precision!' },
    FIFA: { emoji: '⚽', msg: 'Position yourself in the box and curl the ball into the top corner.' },
    MLS: { emoji: '⚽', msg: 'Read the keeper\'s position and place the ball into the corner.' },
  };
  const { emoji, msg } = config[league] ?? { emoji: '🎮', msg: '' };
  const [score, setScore] = useState({ you: 0, cpu: 0, shots: 0 });
  const [lastResult, setLastResult] = useState('');

  const shoot = () => {
    const r = Math.random();
    const scored = r < 0.42;
    const cpuScored = Math.random() < 0.38;
    setScore(s => ({ you: s.you + (scored ? 1 : 0), cpu: s.cpu + (cpuScored ? 1 : 0), shots: s.shots + 1 }));
    setLastResult(scored ? `${emoji} GOAL! You scored!` : '🧤 Keeper saves it!');
  };

  return (
    <div className="space-y-4 text-center">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="text-[--small-orange] text-3xl font-black">{score.you}</div>
          <div className="text-white/40 text-xs">You</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="text-white text-lg font-black">{score.shots}</div>
          <div className="text-white/40 text-xs">Shots</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="text-red-400 text-3xl font-black">{score.cpu}</div>
          <div className="text-white/40 text-xs">CPU</div>
        </div>
      </div>
      {lastResult && <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-white font-bold text-lg">{lastResult}</motion.p>}
      <p className="text-white/50 text-sm">{msg}</p>
      <motion.button whileTap={{ scale: 0.9 }} onClick={shoot}
        className="w-full bg-[--small-orange] text-white font-black py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity">
        {emoji} SHOOT!
      </motion.button>
      <button onClick={() => { setScore({ you: 0, cpu: 0, shots: 0 }); setLastResult(''); }}
        className="text-white/30 text-xs flex items-center justify-center gap-1 mx-auto hover:text-white/60">
        <RotateCcw size={12} /> Reset
      </button>
    </div>
  );
}

function SimulationComponent({ league }: { league: SportLeague }) {
  if (league === 'NBA') return <BasketballSim />;
  if (league === 'NFL') return <FootballSim />;
  if (league === 'MLB') return <BaseballSim />;
  return <GenericSim league={league} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTIONS CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS: SectionConfig[] = [
  { id: 'OVERVIEW',   label: 'Overview',   icon: <BookOpen size={14} /> },
  { id: 'FIELD',      label: 'The Field',  icon: <Target size={14} /> },
  { id: 'POSITIONS',  label: 'Positions',  icon: <Users size={14} /> },
  { id: 'SCORING',    label: 'Scoring',    icon: <Trophy size={14} /> },
  { id: 'RULES',      label: 'Key Rules',  icon: <Shield size={14} /> },
  { id: 'STRATEGY',   label: 'Strategy',   icon: <Lightbulb size={14} /> },
  { id: 'PLAY',       label: 'Play Now',   icon: <Gamepad2 size={14} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface SportExplainerModuleProps {
  league: SportLeague;
  onBack: () => void;
}

export default function SportExplainerModule({ league, onBack }: SportExplainerModuleProps) {
  const [section, setSection] = useState<Section>('OVERVIEW');
  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const sport = SPORT_DATA[league];
  const currentIdx = SECTIONS.findIndex(s => s.id === section);

  const scrollNavToActive = useCallback(() => {
    if (!navRef.current) return;
    const active = navRef.current.querySelector('[data-active="true"]') as HTMLElement;
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  useEffect(() => { scrollNavToActive(); }, [section, scrollNavToActive]);

  const go = (dir: 1 | -1) => {
    const next = SECTIONS[currentIdx + dir];
    if (next) setSection(next.id);
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#080808]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: sport.color + '30', color: sport.color === '#000000' ? '#FFB81C' : sport.color }}>
                {sport.league}
              </span>
            </div>
            <h1 className="text-sm font-black tracking-tight leading-tight">How to Play {sport.name}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2 text-white/30 text-[10px]">
            <Star size={10} className="text-[--small-orange]" /> Beginner Friendly
          </div>
        </div>

        {/* Section nav */}
        <div ref={navRef} className="flex gap-1 overflow-x-auto no-scrollbar px-4 pb-3">
          {SECTIONS.map(s => (
            <button key={s.id} data-active={section === s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 transition-all ${
                section === s.id
                  ? 'text-white border border-white/20'
                  : 'bg-white/5 text-white/40 hover:text-white/70'
              }`}
              style={section === s.id ? { background: sport.color + '30', borderColor: sport.color + '60' } : {}}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}>

            {/* ── OVERVIEW ── */}
            {section === 'OVERVIEW' && (
              <div className="space-y-5">
                <div className="relative overflow-hidden rounded-3xl p-6" style={{ background: `linear-gradient(135deg, ${sport.color}22 0%, #0a0a0a 100%)` }}>
                  <div className="text-4xl mb-3">
                    {league === 'NBA' ? '🏀' : league === 'NFL' ? '🏈' : league === 'MLB' ? '⚾' : league === 'NHL' ? '🏒' : '⚽'}
                  </div>
                  <h2 className="text-2xl font-black mb-1">{sport.name}</h2>
                  <p className="text-white/50 text-sm font-medium italic">"{sport.tagline}"</p>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Target size={14} className="text-[--small-orange]" /> The Objective</h3>
                  <p className="text-white/70 text-sm leading-relaxed">{sport.objective}</p>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <p className="text-white/70 text-sm leading-relaxed">{sport.overview}</p>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><Zap size={14} className="text-[--small-orange]" /> Quick Facts</h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {sport.quickFacts.map(f => (
                      <div key={f.label} className="bg-black/30 rounded-xl px-3 py-2">
                        <div className="text-white/40 text-[9px] font-bold uppercase tracking-wider">{f.label}</div>
                        <div className="text-white font-black text-sm mt-0.5">{f.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── FIELD ── */}
            {section === 'FIELD' && (
              <div className="space-y-5">
                <div className="bg-white/5 rounded-3xl p-4 border border-white/10 overflow-hidden">
                  <h3 className="text-white font-bold text-sm mb-4 text-center">
                    {league === 'NBA' ? 'The Basketball Court' : league === 'NFL' ? 'The Football Field' : league === 'MLB' ? 'The Baseball Diamond' : league === 'NHL' ? 'The Ice Rink' : 'The Soccer Pitch'}
                  </h3>
                  <FieldComponent league={league} />
                </div>

                {league === 'NBA' && (
                  <div className="space-y-2">
                    {[
                      { name: 'The Paint (Key)', desc: 'The rectangular lane under each basket. Offensive players can only stay here for 3 seconds. Where big men battle for rebounds.' },
                      { name: '3-Point Arc', desc: 'Any shot made from behind this line is worth 3 points. It is 23\'9" from the center of the basket at its deepest point (corners are closer at 22\').' },
                      { name: 'Free Throw Line', desc: '15 feet from the basket. This is where players shoot uncontested free throws after being fouled.' },
                      { name: 'Half Court', desc: 'Divides the court in half. Once the offense crosses this line, they cannot pass back or they lose possession.' },
                    ].map(z => (
                      <div key={z.name} className="flex gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: sport.color }} />
                        <div><div className="text-white font-bold text-xs">{z.name}</div><div className="text-white/50 text-xs mt-0.5">{z.desc}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                {league === 'NFL' && (
                  <div className="space-y-2">
                    {[
                      { name: 'End Zone', desc: 'The 10-yard scoring zone at each end of the field. Crossing the goal line into the end zone with the ball scores a touchdown (6 pts).' },
                      { name: 'Yard Lines', desc: 'The field is 100 yards long, marked every 10 yards from each end zone (10, 20, 30, 40, 50, 40, 30, 20, 10). Hash marks every yard.' },
                      { name: 'Line of Scrimmage', desc: 'An imaginary line where each play starts. Players cannot cross it until the ball is snapped — violation is a 5-yard penalty.' },
                      { name: 'Goal Posts', desc: 'The yellow uprights at the back of each end zone. Field goals and extra points must pass through these — 18.5 ft apart.' },
                    ].map(z => (
                      <div key={z.name} className="flex gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#D50A0A' }} />
                        <div><div className="text-white font-bold text-xs">{z.name}</div><div className="text-white/50 text-xs mt-0.5">{z.desc}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                {league === 'MLB' && (
                  <div className="space-y-2">
                    {[
                      { name: 'The Diamond', desc: 'Four bases (home plate, 1st, 2nd, 3rd) form a square (diamond shape) 90 feet apart. Runners must touch all four to score a run.' },
                      { name: 'Pitcher\'s Mound', desc: '60\'6" from home plate. The pitcher stands on this raised circular mound to throw. The elevation gives downward angle to pitches.' },
                      { name: 'Foul Lines', desc: 'Two lines extending from home plate through 1st and 3rd base. Balls hit outside these lines are "foul" — dead balls that count as strikes (up to 2).' },
                      { name: 'Outfield Wall', desc: 'The boundary of the outfield. Distance varies by stadium (300–435 ft). A ball hit over the wall in fair territory is a home run.' },
                    ].map(z => (
                      <div key={z.name} className="flex gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#D50A0A' }} />
                        <div><div className="text-white font-bold text-xs">{z.name}</div><div className="text-white/50 text-xs mt-0.5">{z.desc}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                {(league === 'NHL') && (
                  <div className="space-y-2">
                    {[
                      { name: 'Three Zones', desc: 'The rink is divided into Defensive Zone, Neutral Zone, and Offensive Zone by two blue lines. Teams must pass through all zones to attack.' },
                      { name: 'Goal Crease', desc: 'The blue semicircle in front of each goal. Attackers cannot interfere with the goalie in this area. Goals scored from the crease may be waived off.' },
                      { name: 'Face-off Circles', desc: 'Nine face-off circles/dots on the ice where play restarts after stoppages. The center circle is used at the start of each period.' },
                      { name: 'Goal', desc: 'The 6-foot wide by 4-foot tall net at each end. The puck must completely cross the goal line. Red light activates on a goal.' },
                    ].map(z => (
                      <div key={z.name} className="flex gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#FFB81C' }} />
                        <div><div className="text-white font-bold text-xs">{z.name}</div><div className="text-white/50 text-xs mt-0.5">{z.desc}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                {(league === 'FIFA' || league === 'MLS') && (
                  <div className="space-y-2">
                    {[
                      { name: 'Penalty Box', desc: 'The large box in front of each goal (18-yard box). Fouls by the defense inside this box result in a penalty kick from the spot 12 yards out.' },
                      { name: 'Goal Box', desc: 'The smaller box immediately in front of the goal (6-yard box). Goal kicks are taken from here; goalkeepers are protected from challenges inside.' },
                      { name: 'Center Circle', desc: 'Opponents must stay outside this circle at kickoff. The spot in the very center is where every match begins and restarts after goals.' },
                      { name: 'Corner Arcs', desc: 'Quarter-circle arcs in each corner of the pitch. Corner kicks are taken from inside these arcs when the defense puts the ball behind their own goal line.' },
                    ].map(z => (
                      <div key={z.name} className="flex gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#1B6B3A' }} />
                        <div><div className="text-white font-bold text-xs">{z.name}</div><div className="text-white/50 text-xs mt-0.5">{z.desc}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── POSITIONS ── */}
            {section === 'POSITIONS' && (
              <div className="space-y-5">
                <p className="text-white/50 text-xs text-center">Tap a position on the field to learn more</p>
                <PositionMap league={league} positions={sport.positions} selectedPos={selectedPos} onSelect={id => setSelectedPos(id === selectedPos ? null : id)} />

                <AnimatePresence mode="wait">
                  {selectedPos && (() => {
                    const pos = sport.positions.find(p => p.id === selectedPos);
                    if (!pos) return null;
                    return (
                      <motion.div key={pos.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="bg-white/5 border border-white/15 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border-2"
                            style={{ background: sport.color + '30', borderColor: sport.color + '60', color: sport.color === '#000000' ? '#FFB81C' : sport.color }}>
                            {pos.abbr}
                          </div>
                          <div>
                            <h3 className="text-white font-black text-base">{pos.name}</h3>
                            <div className="flex gap-1 flex-wrap mt-1">
                              {pos.key.map(k => (
                                <span key={k} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/60">{k}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">{pos.role}</p>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>

                {/* All positions list */}
                <div className="space-y-2">
                  {sport.positions.map(pos => (
                    <button key={pos.id} onClick={() => setSelectedPos(pos.id === selectedPos ? null : pos.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedPos === pos.id ? 'bg-white/10 border-white/20' : 'bg-white/[0.03] border-white/8 hover:bg-white/6'}`}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black border shrink-0"
                        style={{ background: sport.color + '25', borderColor: sport.color + '50', color: sport.color === '#000000' ? '#FFB81C' : sport.color }}>
                        {pos.abbr}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-bold">{pos.name}</div>
                        <div className="text-white/40 text-[10px] truncate">{pos.role.split('.')[0]}.</div>
                      </div>
                      <ChevronRight size={12} className="text-white/30 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── SCORING ── */}
            {section === 'SCORING' && (
              <div className="space-y-4">
                <h2 className="text-xl font-black">How to Score</h2>
                <div className="space-y-3">
                  {sport.scoringRules.map((rule, i) => (
                    <motion.div key={rule.name} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                      className="flex gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <div className="text-3xl shrink-0">{rule.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-black text-sm">{rule.name}</h3>
                          <span className="text-[--small-orange] font-black text-sm px-2 py-0.5 bg-[--small-orange]/10 rounded-full">{rule.points}</span>
                        </div>
                        <p className="text-white/60 text-xs leading-relaxed">{rule.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* ── RULES ── */}
            {section === 'RULES' && (
              <div className="space-y-4">
                <h2 className="text-xl font-black">Key Rules for Beginners</h2>
                <p className="text-white/40 text-xs">The most important rules to understand before watching or playing.</p>
                <div className="space-y-3">
                  {sport.keyRules.map((rule, i) => (
                    <motion.div key={rule.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <h3 className="text-white font-black text-sm mb-1.5 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[--small-orange]/15 text-[--small-orange] text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                        {rule.title}
                      </h3>
                      <p className="text-white/60 text-xs leading-relaxed pl-7">{rule.description}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* ── STRATEGY ── */}
            {section === 'STRATEGY' && (
              <div className="space-y-4">
                <h2 className="text-xl font-black">Basic Strategies</h2>
                {(['offense', 'defense'] as const).map(side => (
                  <div key={side}>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2">
                      {side === 'offense' ? <TrendingUp size={10} /> : <Shield size={10} />}
                      {side === 'offense' ? 'Offensive Strategies' : 'Defensive Strategies'}
                    </h3>
                    <div className="space-y-2">
                      {sport.strategies.filter(s => s.side === side).map((strat, i) => (
                        <motion.div key={strat.name} initial={{ opacity: 0, x: side === 'offense' ? -8 : 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                          className={`p-4 rounded-2xl border ${side === 'offense' ? 'bg-blue-500/5 border-blue-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
                          <h4 className={`font-black text-sm mb-1 ${side === 'offense' ? 'text-blue-300' : 'text-red-300'}`}>{strat.name}</h4>
                          <p className="text-white/60 text-xs leading-relaxed">{strat.description}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PLAY ── */}
            {section === 'PLAY' && (
              <div className="space-y-4">
                <div className="text-center space-y-1 mb-6">
                  <h2 className="text-xl font-black">Try It Out</h2>
                  <p className="text-white/40 text-xs">A simplified simulation to practice the basics</p>
                </div>
                <SimulationComponent league={league} />
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Prev / Next nav */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/5">
          <button onClick={() => go(-1)} disabled={currentIdx === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 rounded-xl text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">
            <ChevronLeft size={14} /> {SECTIONS[currentIdx - 1]?.label ?? ''}
          </button>
          <div className="flex gap-1">
            {SECTIONS.map((s, i) => (
              <div key={s.id} onClick={() => setSection(s.id)}
                className={`w-1.5 h-1.5 rounded-full cursor-pointer transition-all ${i === currentIdx ? 'bg-[--small-orange] w-4' : 'bg-white/20'}`} />
            ))}
          </div>
          <button onClick={() => go(1)} disabled={currentIdx === SECTIONS.length - 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-white/10 disabled:opacity-20 transition-all"
            style={currentIdx < SECTIONS.length - 1 ? { background: sport.color + '30', color: 'white' } : {}}>
            {SECTIONS[currentIdx + 1]?.label ?? ''} <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
