import { useState, useEffect } from "react";
import { database } from "./firebase";
import { ref, set, onValue, off, update } from "firebase/database";
import "./TriviaBluffGame.css";
import { correctAnswers, questions, playerEmojis } from "./gameData";

export default function TriviaBluffGame() {
  const [gameState, setGameState] = useState("menu");
  const [gameCode, setGameCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("");
  const [gameData, setGameData] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  // New state for question preview
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);

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
        else if (data.phase === "questionPreview")
          setGameState("questionPreview");
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
      alert("Skriv inn navnet ditt først");
      return;
    }

    if (!selectedEmoji) {
      alert("Velg en emoji først");
      return;
    }

    const code = generateGameCode();
    const gameRef = ref(database, `games/${code}`);

    await set(gameRef, {
      host: playerName,
      phase: "lobby",
      players: {
        [playerName]: { name: playerName, emoji: selectedEmoji, score: 0 },
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
      alert("Skriv inn navn og spillkode");
      return;
    }

    if (!selectedEmoji) {
      alert("Velg en emoji først");
      return;
    }

    const gameRef = ref(database, `games/${joinCode}`);

    try {
      const snapshot = await new Promise((resolve, reject) => {
        onValue(gameRef, resolve, { onlyOnce: true });
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });

      if (!snapshot.val()) {
        alert("Spill ikke funnet! Sjekk spillkoden.");
        return;
      }

      const playerRef = ref(
        database,
        `games/${joinCode}/players/${playerName}`
      );
      await set(playerRef, {
        name: playerName,
        emoji: selectedEmoji,
        score: 0,
      });

      setGameCode(joinCode);
      setIsHost(false);
      setGameState("lobby");
    } catch (error) {
      alert("Kunne ikke joine spillet. Sjekk spillkoden!");
    }
  };

  // Modified startRound function to show question preview first
  const startRound = async () => {
    if (!isHost) return;

    // Generate a random question for preview
    const questionIndex = Math.floor(Math.random() * questions.length);
    setPreviewIndex(questionIndex);
    setPreviewQuestion(questions[questionIndex]);

    // Set phase to questionPreview so only host sees it
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, {
      phase: "questionPreview",
    });
  };

  // New function to skip current question and get a new one
  const skipQuestion = () => {
    const newQuestionIndex = Math.floor(Math.random() * questions.length);
    setPreviewIndex(newQuestionIndex);
    setPreviewQuestion(questions[newQuestionIndex]);
  };

  // New function to confirm question and start the round
  const confirmQuestion = async () => {
    if (!isHost || previewIndex === null) return;

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, {
      phase: "question",
      currentQuestion: questions[previewIndex],
      correctAnswer: correctAnswers[previewIndex],
      answers: {},
      votes: {},
    });
  };

  const submitAnswer = async () => {
    if (!playerAnswer.trim()) {
      alert("Skriv inn et svar");
      return;
    }

    if (
      gameData?.correctAnswer &&
      playerAnswer.toLowerCase().trim() === gameData.correctAnswer.toLowerCase()
    ) {
      alert("Det er det riktige svaret! Prøv å lage et luresvar i stedet.");
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
      alert("Velg et svar");
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

    // Reset preview states
    setPreviewQuestion(null);
    setPreviewIndex(null);

    // Generate a random question for preview
    const questionIndex = Math.floor(Math.random() * questions.length);
    setPreviewIndex(questionIndex);
    setPreviewQuestion(questions[questionIndex]);

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, {
      round: (gameData?.round || 1) + 1,
      phase: "questionPreview", // Start with preview phase
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
          {isAnswerPhase ? "Svar-fremdrift" : "Stemme-fremdrift"}
        </h4>
        <div className="player-progress-list">
          {playerList.map((player) => {
            const isCompleted = completedPlayers.includes(player.name);
            return (
              <div key={player.name} className="player-progress-item">
                <span className="player-progress-emoji">{player.emoji}</span>
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

  // Helper function to get voters for each answer
  const getVotersForAnswer = (answer, votes) => {
    return Object.entries(votes || {})
      .filter(([voter, vote]) => vote === answer)
      .map(([voter]) => voter);
  };

  // Game code display component for all phases except menu and lobby
  const GameCodeDisplay = () => {
    if (gameState === "menu" || gameState === "lobby") return null;

    return <div className="floating-game-code">Spillkode: {gameCode}</div>;
  };

  if (gameState === "menu") {
    return (
      <div className="game-container">
        <div className="game-card">
          <h1 className="game-title">Trivia Bluff</h1>

          <input
            type="text"
            placeholder="Skriv inn navnet ditt"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="input-field"
          />

          <div className="emoji-selection">
            <p className="emoji-title">Velg din emoji</p>
            <div className="emoji-grid">
              {playerEmojis.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`emoji-option ${
                    selectedEmoji === emoji ? "selected" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <button onClick={createGame} className="btn btn-primary mb-4">
            Lag Spill
          </button>

          <div className="join-section">
            <input
              type="text"
              placeholder="Spillkode"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="input-field join-input"
            />
            <button onClick={joinGame} className="btn btn-secondary">
              Bli Med
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
          <h2 className="section-title">Spillrom</h2>
          <div className="game-code-display">
            <p className="code-label">Spillkode</p>
            <p className="game-code">{gameCode}</p>
          </div>

          <div className="players-section">
            <h3 className="players-title">Spillere ({players.length})</h3>
            {players.map((player) => (
              <div key={player.name} className="player-item">
                <span className="player-emoji">{player.emoji}</span>
                <span>
                  {player.name} {player.name === gameData?.host ? "(Vert)" : ""}
                </span>
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
              {players.length >= 2 ? "Start Spill" : "Trenger minst 2 spillere"}
            </button>
          )}

          {!isHost && (
            <p className="waiting-text">
              Venter på at verten starter spillet...
            </p>
          )}
        </div>
      </div>
    );
  }

  // New question preview state - only visible to host
  if (gameState === "questionPreview") {
    if (!isHost) {
      // Non-host players see a waiting screen
      return (
        <div className="game-container">
          <GameCodeDisplay />
          <div className="game-card">
            <h2 className="section-title">Forbereder spørsmål</h2>
            <p className="waiting-text">
              Verten velger spørsmål for denne runden...
            </p>
          </div>
        </div>
      );
    }

    // Host sees the question preview
    return (
      <div className="game-container">
        <GameCodeDisplay />
        <div className="game-card extra-wide">
          <h2 className="section-title">Forhåndsvisning av spørsmål</h2>
          <h3 className="round-number">Runde {gameData?.round}</h3>

          <div className="question-preview">
            <div className="preview-question">
              <h3 className="question-text">{previewQuestion}</h3>
            </div>

            <div className="preview-answer">
              <p className="answer-label">Riktig svar:</p>
              <p className="correct-answer-preview">
                {correctAnswers[previewIndex]}
              </p>
            </div>
          </div>

          <div className="preview-actions">
            <button onClick={skipQuestion} className="btn btn-warning">
              Hopp over dette spørsmålet
            </button>
            <button onClick={confirmQuestion} className="btn btn-success">
              Bruk dette spørsmålet
            </button>
          </div>

          <p className="preview-instruction">
            Velg om du vil bruke dette spørsmålet eller hoppe over til et nytt.
          </p>
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
        <GameCodeDisplay />
        <div className="game-card extra-wide">
          <div className="question-header">
            <h3 className="round-number">Runde {gameData?.round}</h3>
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
                  Lag et overbevisende luresvar som kan lure andre spillere
                </p>
                <input
                  type="text"
                  value={playerAnswer}
                  onChange={(e) => setPlayerAnswer(e.target.value)}
                  className="input-field"
                  placeholder="Skriv ditt luresvar her..."
                />
              </div>

              <button onClick={submitAnswer} className="btn btn-warning">
                Send Inn Svar
              </button>
            </>
          ) : (
            <div className="status-display">
              <h3 className="status-title">Svar Sendt Inn</h3>
              <p className="status-text">
                Venter på at andre spillere sender inn sine svar...
              </p>
              {isHost && allAnswered && (
                <button onClick={proceedToVoting} className="btn btn-success">
                  Start Stemmefase
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

    return (
      <div className="game-container">
        <GameCodeDisplay />
        <div className="game-card extra-wide">
          <h2 className="question-text">{gameData?.currentQuestion}</h2>
          <p className="instruction-text">Velg svaret du tror er riktig</p>

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
                Stem
              </button>
            </>
          ) : (
            <div className="status-display">
              <h3 className="status-title">Stemme Avgitt</h3>
              <p className="status-text">
                Venter på at andre spillere stemmer...
              </p>
              <p className="status-text">
                Resultater vises automatisk når alle har stemt.
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

    return (
      <div className="game-container">
        <GameCodeDisplay />
        <div className="game-card extra-wide">
          <h2 className="section-title">Resultater</h2>
          <h3 className="question-text">{gameData?.currentQuestion}</h3>

          <div className="results-list">
            {allAnswers.map((answer, i) => {
              const voters = getVotersForAnswer(answer.answer, votes);
              const isCorrect = answer.isCorrect;
              const wasMyVote = myVote === answer.answer;

              return (
                <div
                  key={i}
                  className={`result-item ${
                    isCorrect ? "correct-answer" : "wrong-answer"
                  } ${wasMyVote ? "my-vote" : ""}`}
                >
                  <div className="result-content">
                    <div className="result-main">
                      <span className="result-answer">{answer.answer}</span>
                      <span className="result-author">
                        {isCorrect ? "Riktig svar" : `av ${answer.player}`}
                      </span>
                    </div>
                    {voters.length > 0 && (
                      <div className="result-voters">
                        Stemt av: {voters.join(", ")}
                      </div>
                    )}
                  </div>
                  {wasMyVote && (
                    <div className="vote-indicator">
                      {isCorrect
                        ? "Du hadde rett! +2 poeng"
                        : "Du ble lurt av dette luresvaret"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isHost && (
            <button onClick={proceedToRankings} className="btn btn-success">
              Vis Poengtavle
            </button>
          )}

          {!isHost && (
            <div className="calculating">
              <p>Venter på at verten fortsetter...</p>
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
        <GameCodeDisplay />
        <div className="game-card">
          <h2 className="section-title">Poengtavle</h2>
          <p className="round-info">Etter {gameData?.round} runde(r)</p>

          <div className="rankings-list">
            {sortedPlayers.map((player, i) => (
              <div
                key={player.name}
                className={`ranking-item ${i === 0 ? "winner" : ""}`}
              >
                <div className="ranking-info">
                  <span className="ranking-emoji">{player.emoji}</span>
                  <span className="rank">#{i + 1}</span>
                  <span className="player-name">
                    {player.name} {i === 0 ? "(Leder)" : ""}
                  </span>
                </div>
                <span className="score">{player.score}</span>
              </div>
            ))}
          </div>

          {isHost && (
            <button onClick={nextRound} className="btn btn-success">
              Neste Runde
            </button>
          )}

          {!isHost && (
            <p className="waiting-text">
              Venter på at verten starter neste runde...
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
