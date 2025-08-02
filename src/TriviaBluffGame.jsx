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
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);

  // New state for guess settings
  const [maxGuesses, setMaxGuesses] = useState(3);
  const [currentGuessCount, setCurrentGuessCount] = useState(0);

  // New state for manual scoring
  const [showManualScoring, setShowManualScoring] = useState(false);

  // Helper functions (defined early so they can be used in useEffect)
  const getPlayersWhoAnswered = (answers) => {
    const players = new Set();
    Object.values(answers).forEach((answerData) => {
      players.add(answerData.player);
    });
    return Array.from(players);
  };

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
        else if (data.phase === "manualScoring") setGameState("manualScoring");
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
      setCurrentGuessCount(0);
    }
  }, [gameData?.phase, gameData?.currentQuestion]);

  // Auto-advance to voting when all players have answered
  useEffect(() => {
    if (!isHost || !gameData || gameData.phase !== "question") return;

    const totalPlayers = Object.keys(gameData.players || {}).length;
    const playersWhoAnswered = gameData.answers
      ? getPlayersWhoAnswered(gameData.answers)
      : [];

    if (totalPlayers > 0 && playersWhoAnswered.length === totalPlayers) {
      setTimeout(async () => {
        const gameRef = ref(database, `games/${gameCode}`);
        await update(gameRef, { phase: "voting" });
      }, 1000);
    }
  }, [
    gameData?.answers,
    gameData?.players,
    gameData?.phase,
    isHost,
    gameCode,
    getPlayersWhoAnswered,
  ]);

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
      maxGuesses: maxGuesses, // Store max guesses setting
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

  const startRound = async () => {
    if (!isHost) return;

    const questionIndex = Math.floor(Math.random() * questions.length);
    setPreviewIndex(questionIndex);
    setPreviewQuestion(questions[questionIndex]);

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, {
      phase: "questionPreview",
    });
  };

  const skipQuestion = () => {
    const newQuestionIndex = Math.floor(Math.random() * questions.length);
    setPreviewIndex(newQuestionIndex);
    setPreviewQuestion(questions[newQuestionIndex]);
  };

  const confirmQuestion = async () => {
    if (!isHost || previewIndex === null) return;

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, {
      phase: "question",
      currentQuestion: questions[previewIndex],
      correctAnswer: correctAnswers[previewIndex],
      answers: {},
      votes: {},
      playerGuessCount: {}, // Track guesses per player
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

    // Check if player has reached max guesses
    const playerGuesses = gameData?.playerGuessCount?.[playerName] || 0;
    if (playerGuesses >= gameData?.maxGuesses) {
      alert(`Du har brukt opp alle dine ${gameData.maxGuesses} forsøk!`);
      return;
    }

    // Create unique answer key for each attempt
    const answerKey = `${playerName}_${playerGuesses + 1}`;
    const answerRef = ref(database, `games/${gameCode}/answers/${answerKey}`);
    await set(answerRef, {
      answer: playerAnswer,
      player: playerName,
      attemptNumber: playerGuesses + 1,
    });

    // Update guess count
    const guessCountRef = ref(
      database,
      `games/${gameCode}/playerGuessCount/${playerName}`
    );
    const newGuessCount = playerGuesses + 1;
    await set(guessCountRef, newGuessCount);
    setCurrentGuessCount(newGuessCount);

    // Clear the input field for next attempt
    setPlayerAnswer("");

    // Set hasAnswered to true if this was the final guess
    if (newGuessCount >= gameData?.maxGuesses) {
      setHasAnswered(true);
    }
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

    console.log("Calculating scores...", gameData); // Debug log

    const newScores = { ...gameData.players };
    const votes = gameData.votes || {};
    const answers = gameData.answers || {};

    Object.entries(votes).forEach(([voter, votedAnswer]) => {
      if (votedAnswer === gameData.correctAnswer) {
        newScores[voter].score += 2;
      }

      Object.entries(answers).forEach(([answerKey, answerData]) => {
        if (answerData.answer === votedAnswer && answerData.player !== voter) {
          newScores[answerData.player].score += 1;
        }
      });
    });

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { players: newScores });
    console.log("Scores updated!", newScores); // Debug log
  };

  const proceedToManualScoring = async () => {
    if (!isHost) return;
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { phase: "manualScoring" });
    setShowManualScoring(true);
  };

  const awardPointsToPlayer = async (playerName, points) => {
    if (!isHost) return;

    const newScores = { ...gameData.players };
    newScores[playerName].score += points;

    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { players: newScores });
  };

  const proceedToRankings = async () => {
    if (!isHost) return;
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { phase: "rankings" });
    setShowManualScoring(false);
  };

  const nextRound = async () => {
    if (!isHost) return;
    console.log("Starting next round..."); // Debug log

    try {
      setPreviewQuestion(null);
      setPreviewIndex(null);

      const questionIndex = Math.floor(Math.random() * questions.length);
      setPreviewIndex(questionIndex);
      setPreviewQuestion(questions[questionIndex]);

      const gameRef = ref(database, `games/${gameCode}`);
      await update(gameRef, {
        round: (gameData?.round || 1) + 1,
        phase: "questionPreview",
      });
      console.log("Successfully started next round"); // Debug log
    } catch (error) {
      console.error("Error starting next round:", error);
    }
  };

  const proceedToVoting = async () => {
    if (!isHost) return;
    const gameRef = ref(database, `games/${gameCode}`);
    await update(gameRef, { phase: "voting" });
  };

  const proceedToResults = async () => {
    if (!isHost) return;
    console.log("Proceeding to results..."); // Debug log
    try {
      await calculateScores();
      const gameRef = ref(database, `games/${gameCode}`);
      await update(gameRef, { phase: "results" });
      console.log("Successfully moved to results phase"); // Debug log
    } catch (error) {
      console.error("Error proceeding to results:", error);
    }
  };

  // Helper function to get unique answers (remove duplicates)
  const getUniqueAnswers = (answers) => {
    const uniqueAnswers = [];
    const seenAnswers = new Set();

    Object.values(answers).forEach((answerData) => {
      const answerText = answerData.answer.toLowerCase().trim();
      if (!seenAnswers.has(answerText)) {
        seenAnswers.add(answerText);
        uniqueAnswers.push(answerData);
      }
    });

    return uniqueAnswers;
  };

  // Helper function to get all players who submitted the same answer
  const getPlayersForAnswer = (targetAnswer, answers) => {
    return Object.values(answers)
      .filter(
        (answerData) =>
          answerData.answer.toLowerCase().trim() ===
          targetAnswer.toLowerCase().trim()
      )
      .map((answerData) => answerData.player);
  };

  const renderProgressIndicators = (currentPhase, players, answers, votes) => {
    const playerList = Object.values(players || {});
    const isAnswerPhase = currentPhase === "question";
    const isVotingPhase = currentPhase === "voting";

    if (!isAnswerPhase && !isVotingPhase) return null;

    const completedPlayers = isAnswerPhase
      ? getPlayersWhoAnswered(answers || {})
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

  const getVotersForAnswer = (answer, votes) => {
    return Object.entries(votes || {})
      .filter(([voter, vote]) => vote === answer)
      .map(([voter]) => voter);
  };

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

          {/* New: Max guesses selection */}
          <div className="guess-settings">
            <p className="guess-title">Maks antall gjett per spørsmål</p>
            <div className="guess-options">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setMaxGuesses(num)}
                  className={`guess-option ${
                    maxGuesses === num ? "selected" : ""
                  }`}
                >
                  {num}
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

          <div className="game-settings-display">
            <p className="settings-text">
              Maks {gameData?.maxGuesses || 3} gjett per spørsmål
            </p>
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

  if (gameState === "questionPreview") {
    if (!isHost) {
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
      ? getPlayersWhoAnswered(gameData.answers).length
      : 0;
    const totalPlayers = gameData?.players
      ? Object.keys(gameData.players).length
      : 0;
    const allAnswered = answeredCount === totalPlayers;
    const playerGuesses = gameData?.playerGuessCount?.[playerName] || 0;
    const remainingGuesses = (gameData?.maxGuesses || 3) - playerGuesses;

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
              <div className="guess-counter">
                <p className="guess-text">
                  Gjenstående forsøk: {remainingGuesses} av{" "}
                  {gameData?.maxGuesses || 3}
                </p>
              </div>

              <div className="answer-section">
                <p className="instruction-text">
                  Lag overbevisende luresvar som kan lure andre spillere
                  {(gameData?.maxGuesses || 3) > 1 && (
                    <span className="multiple-answers-hint">
                      {" "}
                      (Du kan lage {gameData?.maxGuesses || 3} forskjellige
                      svar!)
                    </span>
                  )}
                </p>
                <input
                  type="text"
                  value={playerAnswer}
                  onChange={(e) => setPlayerAnswer(e.target.value)}
                  className="input-field"
                  placeholder="Skriv ditt luresvar her..."
                />
              </div>

              <button
                onClick={submitAnswer}
                className="btn btn-warning"
                disabled={remainingGuesses <= 0}
              >
                {remainingGuesses > 0 ? "Send Inn Svar" : "Ingen forsøk igjen"}
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
    const uniqueAnswers = getUniqueAnswers(answers);
    const correctAnswer = { answer: gameData?.correctAnswer, isCorrect: true };
    const allAnswers = [...uniqueAnswers, correctAnswer].sort(
      () => Math.random() - 0.5
    );

    const totalPlayers = gameData?.players
      ? Object.keys(gameData.players).length
      : 0;
    const votedPlayers = gameData?.votes
      ? Object.keys(gameData.votes).length
      : 0;
    const allVoted = totalPlayers > 0 && votedPlayers === totalPlayers;

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
              {isHost && allVoted && (
                <>
                  <p className="status-text">Alle har stemt!</p>
                  <button
                    onClick={proceedToResults}
                    className="btn btn-success"
                  >
                    Vis Resultater
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "results") {
    const answers = gameData?.answers ? Object.values(gameData.answers) : [];
    const uniqueAnswers = getUniqueAnswers(answers);
    const correctAnswer = { answer: gameData?.correctAnswer, isCorrect: true };
    const allAnswers = [...uniqueAnswers, correctAnswer];
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
              const allPlayersWhoAnswered = isCorrect
                ? []
                : getPlayersForAnswer(answer.answer, gameData?.answers || {});

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
                        {isCorrect
                          ? "Riktig svar"
                          : allPlayersWhoAnswered.length > 1
                          ? `av ${allPlayersWhoAnswered.join(", ")}`
                          : `av ${answer.player}`}
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
            <div className="host-actions">
              <button
                onClick={proceedToManualScoring}
                className="btn btn-warning"
              >
                Gi ekstra poeng
              </button>
              <button onClick={proceedToRankings} className="btn btn-success">
                Vis Poengtavle
              </button>
            </div>
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

  if (gameState === "manualScoring") {
    const players = gameData?.players ? Object.values(gameData.players) : [];
    const answers = gameData?.answers ? Object.values(gameData.answers) : [];
    const uniqueAnswers = getUniqueAnswers(answers);

    if (!isHost) {
      return (
        <div className="game-container">
          <GameCodeDisplay />
          <div className="game-card">
            <h2 className="section-title">Venter på poengfordeling</h2>
            <p className="waiting-text">Verten gir ut ekstra poeng...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="game-container">
        <GameCodeDisplay />
        <div className="game-card extra-wide">
          <h2 className="section-title">Gi ekstra poeng</h2>
          <p className="instruction-text">
            Klikk på svarene du mener var riktige for å gi poeng til spillerne
          </p>

          <div className="manual-scoring-section">
            <h4 className="manual-scoring-title">Spillernes svar:</h4>
            <div className="manual-answers-list">
              {uniqueAnswers.map((answer, i) => {
                const allPlayersWhoAnswered = getPlayersForAnswer(
                  answer.answer,
                  gameData?.answers || {}
                );
                return (
                  <div key={i} className="manual-answer-item">
                    <div className="manual-answer-content">
                      <span className="manual-answer-text">
                        {answer.answer}
                      </span>
                      <span className="manual-answer-players">
                        av {allPlayersWhoAnswered.join(", ")}
                      </span>
                    </div>
                    <div className="manual-answer-actions">
                      {allPlayersWhoAnswered.map((playerName) => (
                        <button
                          key={playerName}
                          onClick={() => awardPointsToPlayer(playerName, 2)}
                          className="btn btn-small btn-success"
                        >
                          Gi 2p til {playerName}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={proceedToRankings} className="btn btn-primary">
            Ferdig - Vis poengtavle
          </button>
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
            <>
              <p className="status-text">Alle spillere har fullført runden!</p>
              <button onClick={nextRound} className="btn btn-success">
                Neste Runde
              </button>
            </>
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
