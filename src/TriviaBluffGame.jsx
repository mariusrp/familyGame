import { useState, useEffect } from "react";
import { database } from "./firebase";
import { ref, set, onValue, off, update } from "firebase/database";
import "./TriviaBluffGame.css";
import { correctAnswers, questions } from "./gameData";

export default function TriviaBluffGame() {
  const [gameState, setGameState] = useState("menu");
  const [gameCode, setGameCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [gameData, setGameData] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  // Listen to game changes
  useEffect(() => {
    if (!gameCode) return;

    const gameRef = ref(database, `games/${gameCode}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameData(data);

        // Update game state based on server data
        if (data.phase === "lobby") setGameState("lobby");
        else if (data.phase === "question") setGameState("question");
        else if (data.phase === "voting") setGameState("voting");
        else if (data.phase === "results") setGameState("results");
        else if (data.phase === "rankings") setGameState("rankings");
      }
    });

    return () => off(gameRef, "value", unsubscribe);
  }, [gameCode]);

  // Reset player states when new round starts
  useEffect(() => {
    if (gameData?.phase === "question") {
      setHasAnswered(false);
      setHasVoted(false);
      setPlayerAnswer("");
      setSelectedAnswer("");
    }
  }, [gameData?.phase, gameData?.currentQuestion]);

  // Auto-advance to results after voting (and calculate scores)
  useEffect(() => {
    if (!isHost || !gameData || gameData.phase !== "voting") return;

    const totalPlayers = Object.keys(gameData.players || {}).length;
    const votedPlayers = Object.keys(gameData.votes || {}).length;

    if (totalPlayers > 0 && votedPlayers === totalPlayers) {
      setTimeout(async () => {
        await calculateScores();
        const gameRef = ref(database, `games/${gameCode}`);
        await update(gameRef, { phase: "results" });
      }, 2000);
    }
  }, [gameData?.votes, gameData?.players, gameData?.phase, isHost, gameCode]);

  const generateGameCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createGame = async () => {
    if (!playerName.trim()) {
      alert("Please enter your name first");
      return;
    }

    const code = generateGameCode();
    const gameRef = ref(database, `games/${code}`);

    await set(gameRef, {
      host: playerName,
      phase: "lobby",
      players: {
        [playerName]: { name: playerName, score: 0 },
      },
      round: 1,
      created: Date.now(),
    });

    setGameCode(code);
    setIsHost(true);
    setGameState("lobby");
  };

  const joinGame = async () => {
    if (!playerName.trim() || !joinCode.trim()) {
      alert("Please enter your name and game code");
      return;
    }

    const gameRef = ref(database, `games/${joinCode}`);

    try {
      const snapshot = await new Promise((resolve, reject) => {
        onValue(gameRef, resolve, { onlyOnce: true });
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });

      if (!snapshot.val()) {
        alert("Game not found! Please check the game code.");
        return;
      }

      const playerRef = ref(
        database,
        `games/${joinCode}/players/${playerName}`
      );
      await set(playerRef, {
        name: playerName,
        score: 0,
      });

      setGameCode(joinCode);
      setIsHost(false);
      setGameState("lobby");
    } catch (error) {
      alert("Could not join the game. Please check the game code!");
    }
  };

  const startRound = async () => {
    if (!isHost) return;

    const questionIndex = Math.floor(Math.random() * questions.length);
    const gameRef = ref(database, `games/${gameCode}`);

    await update(gameRef, {
      phase: "question",
      currentQuestion: questions[questionIndex],
      correctAnswer: correctAnswers[questionIndex],
      answers: {},
      votes: {},
    });
  };

  const submitAnswer = async () => {
    if (!playerAnswer.trim()) {
      alert("Please enter an answer");
      return;
    }

    if (
      gameData?.correctAnswer &&
      playerAnswer.toLowerCase().trim() === gameData.correctAnswer.toLowerCase()
    ) {
      alert("That's the correct answer! Try to create a decoy answer instead.");
      return;
    }

    const answerRef = ref(database, `games/${gameCode}/answers/${playerName}`);
    await set(answerRef, {
      answer: playerAnswer,
      player: playerName,
    });

    setHasAnswered(true);
  };

  const submitVote = async () => {
    if (!selectedAnswer) {
      alert("Please select an answer");
      return;
    }

    const voteRef = ref(database, `games/${gameCode}/votes/${playerName}`);
    await set(voteRef, selectedAnswer);

    setHasVoted(true);
  };

  const calculateScores = async () => {
    if (!gameData || !isHost) return;

    const newScores = { ...gameData.players };
    const votes = gameData.votes || {};
    const answers = gameData.answers || {};

    Object.entries(votes).forEach(([voter, votedAnswer]) => {
      if (votedAnswer === gameData.correctAnswer) {
        newScores[voter].score += 2;
      }

      Object.entries(answers).forEach(([answerPlayer, answerData]) => {
        if (answerData.answer === votedAnswer && answerPlayer !== voter) {
          newScores[answerPlayer].score += 1;
        }
      });
    });

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { players: newScores });
  };

  const nextRound = async () => {
    if (!isHost) return;

    const questionIndex = Math.floor(Math.random() * questions.length);
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, {
      round: (gameData?.round || 1) + 1,
      phase: "question",
      currentQuestion: questions[questionIndex],
      correctAnswer: correctAnswers[questionIndex],
      answers: {},
      votes: {},
    });
  };

  const proceedToVoting = async () => {
    if (!isHost) return;
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { phase: "voting" });
  };

  const proceedToRankings = async () => {
    if (!isHost) return;
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { phase: "rankings" });
  };

  // Helper function to render progress indicators
  const renderProgressIndicators = (currentPhase, players, answers, votes) => {
    const playerList = Object.values(players || {});
    const isAnswerPhase = currentPhase === "question";
    const isVotingPhase = currentPhase === "voting";

    if (!isAnswerPhase && !isVotingPhase) return null;

    const completedPlayers = isAnswerPhase
      ? Object.keys(answers || {})
      : Object.keys(votes || {});

    return (
      <div className="progress-indicators">
        <h4 className="progress-title">
          {isAnswerPhase ? "Answer Progress" : "Voting Progress"}
        </h4>
        <div className="player-progress-list">
          {playerList.map((player) => {
            const isCompleted = completedPlayers.includes(player.name);
            return (
              <div key={player.name} className="player-progress-item">
                <div
                  className={`progress-checkbox ${
                    isCompleted ? "completed" : ""
                  }`}
                />
                <span
                  className={`progress-player-name ${
                    isCompleted ? "completed" : ""
                  }`}
                >
                  {player.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (gameState === "menu") {
    return (
      <div className="game-container">
        <div className="game-card">
          <h1 className="game-title">Trivia Bluff</h1>

          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="input-field"
          />

          <button onClick={createGame} className="btn btn-primary mb-4">
            Create Game
          </button>

          <div className="join-section">
            <input
              type="text"
              placeholder="Game Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="input-field join-input"
            />
            <button onClick={joinGame} className="btn btn-secondary">
              Join Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === "lobby") {
    const players = gameData?.players ? Object.values(gameData.players) : [];

    return (
      <div className="game-container">
        <div className="game-card">
          <h2 className="section-title">Game Lobby</h2>
          <div className="game-code-display">
            <p className="code-label">Game Code</p>
            <p className="game-code">{gameCode}</p>
          </div>

          <div className="players-section">
            <h3 className="players-title">Players ({players.length})</h3>
            {players.map((player) => (
              <div key={player.name} className="player-item">
                {player.name} {player.name === gameData?.host ? "(Host)" : ""}
              </div>
            ))}
          </div>

          {isHost && (
            <button
              onClick={startRound}
              disabled={players.length < 2}
              className={`btn ${
                players.length >= 2 ? "btn-success" : "btn-disabled"
              }`}
            >
              {players.length >= 2 ? "Start Game" : "Need at least 2 players"}
            </button>
          )}

          {!isHost && (
            <p className="waiting-text">
              Waiting for host to start the game...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "question") {
    const answeredCount = gameData?.answers
      ? Object.keys(gameData.answers).length
      : 0;
    const totalPlayers = gameData?.players
      ? Object.keys(gameData.players).length
      : 0;
    const allAnswered = answeredCount === totalPlayers;

    return (
      <div className="game-container">
        <div className="game-card extra-wide">
          <div className="question-header">
            <h3 className="round-number">Round {gameData?.round}</h3>
            <h2 className="question-text">{gameData?.currentQuestion}</h2>
          </div>

          {renderProgressIndicators(
            gameData?.phase,
            gameData?.players,
            gameData?.answers,
            gameData?.votes
          )}

          {!hasAnswered ? (
            <>
              <div className="answer-section">
                <p className="instruction-text">
                  Create a convincing decoy answer that might fool other players
                </p>
                <input
                  type="text"
                  value={playerAnswer}
                  onChange={(e) => setPlayerAnswer(e.target.value)}
                  className="input-field"
                  placeholder="Enter your decoy answer..."
                />
              </div>

              <button onClick={submitAnswer} className="btn btn-warning">
                Submit Answer
              </button>
            </>
          ) : (
            <div className="status-display">
              <h3 className="status-title">Answer Submitted</h3>
              <p className="status-text">
                Waiting for other players to submit their answers...
              </p>
              {isHost && allAnswered && (
                <button onClick={proceedToVoting} className="btn btn-success">
                  Start Voting Phase
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "voting") {
    const answers = gameData?.answers ? Object.values(gameData.answers) : [];
    const correctAnswer = { answer: gameData?.correctAnswer, isCorrect: true };
    const allAnswers = [...answers, correctAnswer].sort(
      () => Math.random() - 0.5
    );

    const votedCount = gameData?.votes ? Object.keys(gameData.votes).length : 0;
    const totalPlayers = gameData?.players
      ? Object.keys(gameData.players).length
      : 0;

    return (
      <div className="game-container">
        <div className="game-card extra-wide">
          <h2 className="question-text">{gameData?.currentQuestion}</h2>
          <p className="instruction-text">
            Select the answer you believe is correct
          </p>

          {renderProgressIndicators(
            gameData?.phase,
            gameData?.players,
            gameData?.answers,
            gameData?.votes
          )}

          {!hasVoted ? (
            <>
              <div className="answers-grid">
                {allAnswers.map((answer, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedAnswer(answer.answer)}
                    className={`answer-option ${
                      selectedAnswer === answer.answer ? "selected" : ""
                    }`}
                  >
                    {answer.answer}
                  </button>
                ))}
              </div>

              <button
                onClick={submitVote}
                disabled={!selectedAnswer}
                className={`btn ${
                  selectedAnswer ? "btn-success" : "btn-disabled"
                }`}
              >
                Submit Vote
              </button>
            </>
          ) : (
            <div className="status-display">
              <h3 className="status-title">Vote Submitted</h3>
              <p className="status-text">
                Waiting for other players to vote...
              </p>
              <p className="status-text">
                Results will be shown automatically when everyone has voted.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "results") {
    const answers = gameData?.answers ? Object.values(gameData.answers) : [];
    const correctAnswer = { answer: gameData?.correctAnswer, isCorrect: true };
    const allAnswers = [...answers, correctAnswer];
    const myVote = gameData?.votes?.[playerName];
    const votes = gameData?.votes || {};

    // Count votes for each answer
    const voteCount = {};
    Object.values(votes).forEach((vote) => {
      voteCount[vote] = (voteCount[vote] || 0) + 1;
    });

    return (
      <div className="game-container">
        <div className="game-card extra-wide">
          <h2 className="section-title">Round Results</h2>
          <h3 className="question-text">{gameData?.currentQuestion}</h3>

          <div className="results-list">
            {allAnswers.map((answer, i) => {
              const votes = voteCount[answer.answer] || 0;
              const votePlural = votes === 1 ? "vote" : "votes";

              return (
                <div
                  key={i}
                  className={`result-item ${
                    answer.isCorrect
                      ? "correct"
                      : myVote === answer.answer
                      ? "my-vote"
                      : ""
                  }`}
                >
                  <div className="result-content">
                    <span className="result-answer">{answer.answer}</span>
                    <span className="result-label">
                      {answer.isCorrect
                        ? `Correct Answer • ${votes} ${votePlural}`
                        : `by ${answer.player} • ${votes} ${votePlural}`}
                    </span>
                  </div>
                  {myVote === answer.answer && (
                    <div className="vote-indicator">
                      {answer.isCorrect
                        ? "You got it right! +2 points"
                        : "You were fooled by this decoy answer"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isHost && (
            <button onClick={proceedToRankings} className="btn btn-success">
              Show Scoreboard
            </button>
          )}

          {!isHost && (
            <div className="calculating">
              <p>Waiting for host to continue...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "rankings") {
    const players = gameData?.players ? Object.values(gameData.players) : [];
    const sortedPlayers = players.sort((a, b) => b.score - a.score);

    return (
      <div className="game-container">
        <div className="game-card">
          <h2 className="section-title">Scoreboard</h2>
          <p className="round-info">After {gameData?.round} round(s)</p>

          <div className="rankings-list">
            {sortedPlayers.map((player, i) => (
              <div
                key={player.name}
                className={`ranking-item ${i === 0 ? "winner" : ""}`}
              >
                <div className="ranking-info">
                  <span className="rank">#{i + 1}</span>
                  <span className="player-name">
                    {player.name} {i === 0 ? "(Leader)" : ""}
                  </span>
                </div>
                <span className="score">{player.score}</span>
              </div>
            ))}
          </div>

          {isHost && (
            <button onClick={nextRound} className="btn btn-success">
              Next Round
            </button>
          )}

          {!isHost && (
            <p className="waiting-text">
              Waiting for host to start next round...
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
