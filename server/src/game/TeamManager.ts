import { Team } from '@shared/constants';

type TeamScores = Record<Team, number>;

export class TeamManager {
  scores: TeamScores = { A: 0, B: 0 };
  private teamCounts: TeamScores = { A: 0, B: 0 };

  assignTeam(): Team {
    return this.teamCounts.A <= this.teamCounts.B ? 'A' : 'B';
  }
  onPlayerJoin(team: Team) { this.teamCounts[team]++; }
  onPlayerLeave(team: Team) { this.teamCounts[team]--; }
  addKill(killerTeam: Team) { this.scores[killerTeam]++; }
  reset() { this.scores = { A: 0, B: 0 }; this.teamCounts = { A: 0, B: 0 }; }
  getCounts() { return { ...this.teamCounts }; }
}
