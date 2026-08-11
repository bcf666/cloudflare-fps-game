export const GAME_CONSTANTS = {
  PLAYER: {
    SPEED: 6.0,
    JUMP_VELOCITY: 8.0,
    GRAVITY: 20.0,
    HEIGHT: 1.8,
    RADIUS: 0.4,
    EYE_HEIGHT: 1.6,
    MAX_HP: 100,
    RESPAWN_TIME: 3.0,
  },
  WEAPON: {
    DAMAGE: 25,
    FIRE_RATE_MS: 200,
    MAG_SIZE: 30,
    RELOAD_TIME_S: 2.0,
    BULLET_SPEED: 150.0,
    BULLET_LIFETIME_S: 1.5,
    SPREAD_RAD: 0.02,
  },
  MAP: {
    SIZE: 50,
    WALL_HEIGHT: 3,
  },
  NETWORK: {
    TICK_HZ: 30,
    INTERP_DELAY_MS: 100,
  },
  GAME: {
    MATCH_DURATION_S: 5 * 60,
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 10,
    COUNTDOWN_S: 3,
  },
} as const;

export type Team = 'A' | 'B';
export const TEAMS: Team[] = ['A', 'B'];
