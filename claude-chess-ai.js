// claude-chess-ai.js
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeChessAI {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async getChessMove(game, difficulty = 'medium', timeRemaining = null) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Claude API key not found, falling back to random moves');
      return this.getRandomMove(game);
    }

    try {
      const fen = game.fen();
      const possibleMoves = game.moves();
      const gameHistory = game.history();
      const moveCount = Math.floor(game.history().length / 2) + 1;
      
      // Determine thinking time based on difficulty and time remaining
      const thinkingTime = this.calculateThinkingTime(difficulty, timeRemaining);
      
      const prompt = this.buildPrompt(fen, possibleMoves, gameHistory, difficulty, moveCount);
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const responseText = response.content[0].text.trim();
      const suggestedMove = this.extractMoveFromResponse(responseText, possibleMoves);
      
      if (suggestedMove && possibleMoves.includes(suggestedMove)) {
        console.log(`Claude suggests: ${suggestedMove} (${difficulty} difficulty)`);
        return suggestedMove;
      } else {
        console.warn('Claude response invalid, falling back to smart fallback');
        return this.getSmartFallbackMove(game, difficulty);
      }
      
    } catch (error) {
      console.error('Error getting move from Claude:', error);
      return this.getSmartFallbackMove(game, difficulty);
    }
  }

  buildPrompt(fen, possibleMoves, gameHistory, difficulty, moveCount) {
    const difficultyInstructions = {
      easy: "Play at a beginner level. Make simple moves, occasionally miss tactics. Don't look too far ahead.",
      medium: "Play at an intermediate level. Look for basic tactics, control the center, develop pieces safely.",
      hard: "Play at an advanced level. Look for complex tactics, strategic plans, and calculate several moves ahead."
    };

    const gamePhase = moveCount <= 10 ? 'opening' : moveCount <= 25 ? 'middlegame' : 'endgame';
    
    return `You are playing chess as Black. Current position (FEN): ${fen}

Game phase: ${gamePhase} (move ${moveCount})
Recent moves: ${gameHistory.slice(-6).join(', ') || 'Game start'}

Difficulty: ${difficulty}
Instructions: ${difficultyInstructions[difficulty]}

Available moves: ${possibleMoves.join(', ')}

Choose the best move and respond with ONLY the move in algebraic notation (e.g., "Nf6", "e5", "O-O").
${difficulty === 'easy' ? 'Remember to play simply and make some human-like mistakes.' : ''}
${difficulty === 'hard' ? 'Look for the most forcing and strongest moves.' : ''}`;
  }

  extractMoveFromResponse(response, possibleMoves) {
    // Clean the response and look for valid moves
    const cleanResponse = response.replace(/[.,!?]/g, '').trim();
    
    // First, try to find an exact match
    for (const move of possibleMoves) {
      if (cleanResponse === move || cleanResponse.includes(move)) {
        return move;
      }
    }
    
    // If no exact match, try to find partial matches
    const words = cleanResponse.split(/\s+/);
    for (const word of words) {
      for (const move of possibleMoves) {
        if (word === move) {
          return move;
        }
      }
    }
    
    return null;
  }

  calculateThinkingTime(difficulty, timeRemaining) {
    const baseTime = {
      easy: 500,    // 0.5 seconds
      medium: 1500, // 1.5 seconds  
      hard: 3000    // 3 seconds
    };
    
    // Adjust based on time remaining if provided
    if (timeRemaining && timeRemaining < 60) {
      return Math.min(baseTime[difficulty], timeRemaining * 1000 * 0.1); // Use 10% of remaining time
    }
    
    return baseTime[difficulty];
  }

  getSmartFallbackMove(game, difficulty) {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;

    switch (difficulty) {
      case 'easy':
        // 70% random, 30% good moves
        const goodMoves = moves.filter(move => move.captured || move.san.includes('+'));
        if (goodMoves.length > 0 && Math.random() < 0.3) {
          return goodMoves[Math.floor(Math.random() * goodMoves.length)].san;
        }
        return moves[Math.floor(Math.random() * moves.length)].san;
        
      case 'medium':
        // Prefer captures, checks, and piece development
        const tacticalMoves = moves.filter(move => 
          move.captured || 
          move.san.includes('+') || 
          move.san.includes('x') ||
          (move.piece === 'n' || move.piece === 'b') // Develop knights and bishops
        );
        if (tacticalMoves.length > 0) {
          return tacticalMoves[Math.floor(Math.random() * tacticalMoves.length)].san;
        }
        return moves[Math.floor(Math.random() * moves.length)].san;
        
      case 'hard':
        // Prioritize checks, captures, then threats
        const priorityMoves = moves.filter(move => move.san.includes('#')); // Checkmate
        if (priorityMoves.length > 0) return priorityMoves[0].san;
        
        const checkMoves = moves.filter(move => move.san.includes('+'));
        if (checkMoves.length > 0) return checkMoves[Math.floor(Math.random() * checkMoves.length)].san;
        
        const captureMoves = moves.filter(move => move.captured);
        if (captureMoves.length > 0) {
          // Prefer capturing higher value pieces
          captureMoves.sort((a, b) => this.getPieceValue(b.captured) - this.getPieceValue(a.captured));
          return captureMoves[0].san;
        }
        
        return moves[Math.floor(Math.random() * moves.length)].san;
        
      default:
        return moves[Math.floor(Math.random() * moves.length)].san;
    }
  }

  getRandomMove(game) {
    const moves = game.moves();
    return moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : null;
  }

  getPieceValue(piece) {
    const values = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 };
    return values[piece] || 0;
  }

  async getPositionAnalysis(fen) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return "Analysis unavailable - Claude API key not configured";
    }

    try {
      const prompt = `Analyze this chess position (FEN): ${fen}

Provide a brief analysis covering:
1. Material balance
2. Key tactical threats
3. Strategic considerations

Keep it concise (2-3 sentences).`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Error getting position analysis:', error);
      return "Analysis unavailable";
    }
  }
}

module.exports = ClaudeChessAI;