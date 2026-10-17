/**
 * UI strings, one dictionary per supported locale.
 *
 * Event *names* are localized in the database (`event_translation`); this file
 * only covers chrome the dataset cannot provide. `Dict` is derived from the
 * English dictionary, so adding a string there makes every other language a
 * type error until it is translated — no silent English leaks.
 */

import type { SupportedLocale } from "../db/types.ts";
import type { DateLabels } from "../historical-date.ts";

const en = {
  tagline: "Guess when history happened.",
  language: "Language",

  comparisonTitle: "Comparison",
  comparisonBlurb: "Which of the two dates is the floating event closer to?",
  comparisonHint: "Slide the event along the timeline, then lock in your guess.",

  timelineTitle: "Date Guessing",
  timelineBlurb: "Drag along the timeline to place a single event in history.",
  timelineHint: "Drag the marker, then lock in your guess.",

  // The film & TV game. It reuses `screenTitle` from the home board for its
  // name — a mode is named once on this site — so what is new here is only
  // what the other games have no equivalent of.
  //
  // `screenYearAsked` is a rule, not a flourish: the stored year is a release
  // for a film and a premiere for a series, and a player shown the poster of
  // a show that ran eight years has to be told which of the two is being
  // asked. See lib/game/screen.ts.
  screenHint: "Drag the marker to the year, then lock in your guess.",
  screenYearAsked:
    "A film is dated by its release, a series by the year it first aired.",
  formatFilm: "Film",
  formatSeries: "Series",

  // The "Born When?" game. Like the film one it reuses its name from the home
  // board (`whenBornTitle`) — a mode is named once on this site.
  //
  // `whenBornYearAsked` is the counterpart of `screenYearAsked` and is a rule
  // rather than a flourish, for the opposite reason: the film game has to say
  // which of two dates it means, and this one has to say that the date is a
  // birth year at all. The same photograph of Churchill could reasonably be
  // asked about his birth, his premiership or his death.
  whenBornHint: "Drag the marker to the year, then lock in your guess.",
  whenBornYearAsked:
    "Every round asks for the year the person was born — not when they were famous.",
  // The fourteen fields, printed as a pill over the photograph. Singular and
  // naming the one person on screen, never a group. Mapped from the category
  // slug by `PERSON_FIELD_LABEL_KEYS` in lib/game/when-born.ts, and kept in
  // step with the five category translations in
  // supabase/migrations/20261010140000_when_born_topic_category.sql.
  fieldLeader: "Leader",
  fieldReligiousFigure: "Religious Figure",
  fieldPhilosopher: "Philosopher",
  fieldExplorer: "Explorer",
  fieldScientist: "Scientist",
  fieldInventor: "Inventor",
  fieldWriter: "Writer",
  fieldArtist: "Artist",
  fieldMusician: "Musician",
  fieldActor: "Actor",
  fieldDirector: "Director",
  fieldAthlete: "Athlete",
  fieldEntrepreneur: "Entrepreneur",
  fieldActivist: "Activist",
  submitGuess: "Lock in guess",
  comparisonMoveFirst: "Drag the card first",
  // The direct date entry: the alternative to dragging the rail, reached from
  // the round's own controls. The era labels themselves are the existing
  // `commonEra` and `bc` strings — an era is named once on this site, not
  // twice — so these are only the chrome around them.
  enterDate: "Enter a date",
  useTimeline: "Use the timeline",
  yearLabel: "Year",
  eraSwitch: "Switch era",
  invalidDate: "Please enter a valid date.",
  bc: "BC",
  // The era beside a *year*, as the date entry writes it, which is not the
  // same slot as `bc` above: that one labels the door onto the BC timeline,
  // where the short form reads better. This one stands next to a number the
  // player has typed, and has to match what `formatYear` prints on the rail
  // two inches away. Only English distinguishes the two.
  bce: "BCE",
  evolution: "Evolution",
  cosmos: "Cosmos",
  civilizationEra: "Age of Civilization",
  evolutionEra: "Humans & Evolution",
  cosmosEra: "Earth & Cosmos",
  future: "Future",
  commonEra: "CE",
  commonEraTitle: "Common Era",

  // How a *rendered* date is put together, for `formatYear` and
  // `formatHistoricalDate` (lib/historical-date.ts). The era abbreviations
  // above are the pieces; these four say where they go and what the periods
  // between a year and an era are called.
  //
  // `yearWithEra` is an order, not a word: English, German, French and Spanish
  // write "1200 BCE" and Turkish writes "MÖ 1200". Localising the label
  // without localising the order would only move the mistake.
  //
  // The three period templates take `{n}`, and `{th}` is the English ordinal
  // suffix — the languages that do not inflect that way simply leave it out.
  yearWithEra: "{year} {era}",
  decadeLabel: "{n}s",
  centuryLabel: "{n}{th} century",
  millenniumLabel: "{n}{th} millennium",

  // The two words `formatYear` reaches for when a year is too big to print in
  // full: "4.54 billion BCE" rather than "4540000000 BCE". They are part of a
  // *date*, so they are chrome like the era beside them — and they are
  // uppercased on the head-to-head reveal, which is the reason they cannot be
  // left in English: `text-transform: uppercase` under `lang="tr"` turns
  // "million" into "MİLLİON", a word in no language. English's own values are
  // also what SQL's `historical_year_label()` prints, and the two must agree
  // (CLAUDE.md, paired rules) — so `EN_DATE_LABELS` holds exactly these.
  millionLabel: "million",
  billionLabel: "billion",

  yourGuess: "Your guess",
  actualDate: "Actual date",
  yearsOff: "{n} years off",

  // The verdict a locked-in guess earns, best to worst. Which one shows is
  // decided by relative error, not by years — see lib/game/scoring.ts. Five
  // rungs since 2026-10-07: `verdictBad` used to hold the "way off" string and
  // the bottom tier is now its own key, so these two are the pair to read
  // carefully when translating.
  verdictPerfect: "Perfect",
  verdictGreat: "Great",
  verdictGood: "Good",
  verdictBad: "Bad",
  verdictWayOff: "Way off",
  // The kicker over the result panel, opposite `eventNoteTitle` on the panel
  // about the event itself.
  resultTitle: "Your result",
  // The label over the distance on the result card's foot, opposite
  // `yourGuess`. The value under it is still `yearsOff`.
  distanceTitle: "Distance",
  // The comparison rail is six equal sections wide, so that round's result
  // card reports its distance in sections rather than in years. Three strings
  // rather than one with a count, because "1 section" is not "{n} sections"
  // in most of these languages. They are bare counts — the card prints them
  // under a "distance" label in a column about 98px wide, which "2 sections
  // off" does not fit in German or Spanish.
  sectionExact: "Exact",
  sectionOff: "1 section",
  sectionsOff: "{n} sections",
  correct: "Correct",
  incorrect: "Not quite",
  nextRound: "Next round",
  play: "Play",

  moreTitle: "More to come",
  moreBlurb: "Areas being built next.",

  // The four bento cards under `moreTitle` (components/apple-bento.tsx).
  // They were English in the markup until 2026-10-10, which is why they are
  // here: the headline is the whole of each card.
  //
  // Two of them carry a highlighted phrase — the gradient sweep on the card —
  // so the sentence is a template with one `{}` slot rather than three
  // fragments to concatenate. Word order differs per language and a sentence
  // assembled from pieces cannot survive that; a slot can sit anywhere in the
  // string. There are deliberately no line breaks in any of them: the English
  // copy broke its lines by hand and every other language breaks in a
  // different place, so the cards wrap to their own width instead.
  bentoBrowseTitle: "Browse the whole timeline, event by event.",
  bentoLibraryTitle: "A growing library of historical imagery.",
  bentoDailyTitle: "Built for {highlight}",
  bentoDailyHighlight: "daily challenges.",
  bentoEventsTitle: "Up to {events} on the way.",
  bentoEventsCount: "500 more events",
  bentoEventsNote: "(More every week.)",

  // The block between the board and the bento. It was a card of prose until
  // 2026-10-06 (`aboutBlurb` / `aboutHow`, both now gone); it is six pills
  // that open one at a time, with the matching artwork on the stage beside
  // them — see components/home-explorer.tsx.
  //
  // Five of the six titles are reused rather than written again: the board
  // already names four modes and the achievements page names itself, and a
  // second copy of "Survival" in five languages is a second copy to keep in
  // step. Only the library, which is not a mode, needs a title of its own.
  /** The explorer block's heading, above the card rather than inside it — the
   *  same place the bento's `moreTitle` sits. The block had no name at all
   *  before it. */
  explorerHeading: "Best History Game",
  /** One line under that heading, so the block is introduced the way the
   *  bento and the FAQ below it are rather than opening cold on six pills. */
  explorerLead: "Every way to play, and the library each round is drawn from.",
  explorerPrev: "Previous",
  explorerNext: "Next",
  explorerGuessBody:
    "One photograph and one timeline, running from the formation of the Earth to today. Drag the marker to the year you think it happened, then lock it in. Ten questions make a set.",
  explorerCompareBody:
    "Two fixed dates and one event floating between them. No exact year is needed — decide only which of the two it sits closer to.",
  explorerSurvivalBody:
    "Keep answering until you miss. The comparison round with one life and no set of ten: the run ends the moment an event is placed on the wrong side.",
  explorerOtherBody:
    "Football, basketball, film and television — the same timeline game played over one subject at a time. More are on the way.",
  explorerBadgesBody:
    "Six rings that go around your profile picture. Four are a rank you climb on your best set of ten; the other two are earned once. Pick one to see it worn.",
  explorerBadgesPick: "Pick a rank",
  explorerClose: "Close",
  explorerLibraryTitle: "Event library",
  explorerLibraryBody:
    "Every round is drawn from a hand-checked set of events spanning 4.54 billion years, each with a public-domain photograph and a name in five languages.",
  // Written down rather than counted. The panel used to print the live count
  // of published, illustrated rows; it is a round claim about the library now,
  // which is what was asked for — and it is why the home page makes no
  // database read at all any more.
  explorerStatEventsValue: "1000+",
  explorerStatEvents: "events, each with a photograph",
  explorerStatLanguages: "languages, event names included",
  explorerStatSpan: "years of history covered",
  // The span is written per language rather than formatted, because the scale
  // word is what changes: "billion", "Milliarden", "milyar", "millones".
  explorerStatSpanValue: "4.54bn",

  // The FAQ at the foot of the home page, which the menu's FAQ row links to.
  faqTitle: "Frequently asked questions",
  faqBlurb: "What is worth knowing before the first round.",
  faqQ1: "Are the dates of historical events completely accurate?",
  faqA1:
    "Not necessarily. Dates of historical events can be disputed, but we have made every effort to use the dates most widely accepted by historians and the general public. Some dates may still be inaccurate. We encourage users to challenge questionable dates and send feedback through the relevant questions. Your feedback helps us find errors and improve the accuracy of our content.",
  faqQ2: "Can I challenge a date?",
  faqA2:
    "Yes! At the end of each question, below the explanation, you’ll find a “Dispute” button. By clicking it, you can indicate whether you think the correct date should be earlier or later than the one shown. We review these submissions and update our questions when necessary. Your feedback is extremely important to us and plays a vital role in improving our content.",
  faqQ3: "What types of games are available?",
  faqA3:
    "Our website features two main types of games. Each has several variations, including different game modes adapted to various categories, offering multiple ways to play and explore historical events.",
  // Kept verbatim from the first six questions, which is the whole of what
  // survived them: it is the one answer the request pinned as unchanged, so
  // only its key moved.
  faqQ4: "How are guesses scored?",
  faqA4:
    "By how far off you are relative to the event's own age, not by the raw number of years. Every round lands on one of five verdicts — perfect, great, good, bad or way off — and only the last one is a miss.",
  faqQ5: "How can I earn achievements?",
  faqA5:
    "You can earn achievements by playing the different games on our website and reaching specific performance milestones. Each game may offer its own set of achievements that reward your progress.",
  faqQ6: "Can an event’s photo be wrong?",
  faqA6:
    "Yes, there may be small mistakes among event photos. Tempus is a large library containing over 1,000 events, and some of them may contain errors.",
  faqQ7: "Can I play with a friend?",
  faqA7:
    "Yes! In 1v1 mode, you can send your friend the game link and play together. You can also press “Find opponent” to be matched online with a player at your level — sign in, and online matches earn you Chrono Rating.",
  faqQ8: "Do I need to create an account?",
  faqA8:
    "No, you can play the games without an account. However, you need to sign up to earn points, unlock badges, and appear on the leaderboard.",


  // The set: ten questions, then the summary screen. See lib/game/set.ts.
  setProgress: "{n} of {total}",
  seeResults: "See results",
  setComplete: "Set complete",
  setScore: "{hits} of {total} correct",
  setBestStreak: "Best streak",
  setBreakdown: "How the guesses landed",
  playAgain: "Play again",
  backHome: "Back to home",
  shareResult: "Share result",
  shareCopied: "Copied",
  shareFailed: "Could not copy",
  tryComparison: "Try comparison mode",
  tryTimeline: "Try date guessing",
  gradeFlawless: "Flawless set.",
  gradeStrong: "Strong set.",
  gradeFair: "Room to improve.",
  gradeRough: "History is long.",

  // --- survival -------------------------------------------------------------
  // The comparison round played without a bracket: it ends at the first wrong
  // answer rather than at ten. Only the rules differ, so the strings here are
  // the ones a set does not need — a count with no ceiling where a set has a
  // percentage of ten, and the screen that reports it.
  survivalBlurb: "Keep answering. One wrong side ends the run.",
  survivalCleared: "{n} correct",
  survivalOver: "Run over",
  survivalCorrect: "correct answers",
  survivalPrecision: "Precision",
  survivalAnswered: "Answered",
  survivalBestExact: "Best exact run",
  survivalSequence: "Answer by answer",
  survivalShareMore: "+{n} earlier",
  survivalGradeLegendary: "A legendary run.",
  survivalGradeDeep: "Deep into history.",
  survivalGradeSolid: "A solid run.",
  survivalGradeShort: "The first miss comes fast.",

  // Head-to-head: the two-player date-guessing mode. See lib/game/versus.ts.
  versusTitle: "Head to head",
  versusBlurb: "Race a friend through ten dates.",
  versusPlayFriend: "Play a friend",
  // The way in is two cards: online matchmaking on top, a friend and a code
  // under it (components/versus-start.tsx). `versusChooseMode` is the friend
  // card's second step — a match is ten questions from *one* pool
  // (`match.mode`), so the game is picked before the code is minted rather
  // than after. The modes name themselves from the board's own titles; only
  // the general library needs a line of its own here. `versusOnlineTitle` is
  // the online card's kicker, not its headline (`versusFindTitle`).
  versusChooseMode: "Which game?",
  versusModeHistoryBlurb: "Ten dates from the whole of history.",
  versusOnlineTitle: "Online",
  versusOnlineBlurb: "Matched in seconds with a player at your level. Ten dates, live.",
  versusInviteTitle: "Invite a friend",
  versusInviteBlurb: "Send the link or let them scan the code. The match starts when you are both ready.",
  versusCopyLink: "Copy link",
  versusLinkCopied: "Link copied",
  versusShareWhatsApp: "Share on WhatsApp",
  versusInviteMessage: "Play me at Tempus — ten dates, head to head: {url}",
  versusScanHint: "Or scan this",
  versusMatchCode: "Match code",
  versusWaitingForOpponent: "Waiting for your opponent...",
  versusWaitingToJoin: "Waiting for your friend to join...",
  versusOpponentJoined: "Your opponent is here.",
  versusReady: "I am ready",
  versusReadyWaiting: "Waiting for them to be ready...",
  versusYouAreReady: "You are ready",
  versusStarting: "Starting...",
  versusYou: "You",
  versusOpponent: "Opponent",
  versusYouLabel: "You",
  versusThemLabel: "Them",
  versusTimedOut: "Out of time",
  versusRoundPoints: "{n} pts",
  versusSecondsLeft: "{n}s",
  versusAnswered: "Answered",
  versusThinking: "Still guessing",
  versusNextRoundIn: "Next round in {n}",
  versusOpponentOffline: "Your opponent lost connection. The clock keeps running.",
  versusReconnecting: "Reconnecting...",
  versusYouWin: "You win",
  versusYouLose: "You lose",
  versusDraw: "Draw",
  versusFinalScore: "{you} - {them}",
  versusRoundsWon: "Rounds won",
  versusRematch: "Play again",
  versusRematchAsked: "Waiting for them to accept...",
  versusRematchOffer: "Your opponent wants a rematch.",
  versusRematchAccept: "Accept",
  versusRematchDecline: "Decline",
  versusRematchDeclined: "They declined the rematch.",
  versusBackHome: "Back to home",
  versusShareMatch: "Share result",
  versusMatchNotFound: "That invitation is no longer valid.",
  versusMatchFull: "That match already has two players.",
  versusMatchFinished: "That match has already finished.",
  versusLeft: "Your opponent left the match.",
  versusSeatLost: "This tab is not part of that match.",
  versusCreateFailed: "Could not start a match. Try again.",
  versusJoining: "Joining...",
  versusStatusReady: "Ready",
  versusStatusHere: "Here",
  versusStatusAway: "Not here yet",

  // Online play (components/versus-start.tsx, components/versus-search.tsx).
  // Chrono Rating is the online ladder, separate from TP — see
  // lib/game/chrono-rating.ts. `versusRatingValue`/`versusRatingChange` carry
  // the unit, so Turkish can say KP where the others say CR. Nothing here may
  // say *who* the opponent is beyond a name: a public match never tells a
  // player whether the other seat is a person.
  versusFindTitle: "Find an opponent",
  versusFindButton: "Find opponent",
  versusFindNew: "Find new opponent",
  versusSearching: "Searching for an opponent",
  versusSearchCancel: "Cancel",
  versusSearchFailed: "Could not start the search. Try again.",
  versusOpponentFound: "Opponent found",
  versusMatchStartsIn: "Starting in {n}",
  versusOpponentLocked: "Your opponent locked in",
  versusGuestName: "Guest",
  versusVs: "vs",
  versusRatingName: "Chrono Rating",
  versusRatingValue: "{n} CR",
  versusRatingChange: "{delta} CR",
  versusRatingNow: "Now {n} CR",
  versusTierLower: "Lower league",
  versusTierMiddle: "Middle league",
  versusTierUpper: "Upper league",
  versusGuestRatingHint: "Playing as a guest — sign in to earn Chrono Rating.",
  versusSignInForRating: "Sign in",
  versusYouLeft: "You left the match.",
  versusYourLeague: "Your league: {league}",
  // An account with no username yet plays online under none, so it is sent
  // to choose one first (findVersusOpponent, `needs-username`).
  versusNeedsUsername: "Online play needs a username.",
  versusChooseUsername: "Choose one",

  // The top-right menu, which replaced the bare language pill. Only the
  // language picker inside it is wired up; the rest are named now and built
  // later, like the coming-soon tiles on the home page.
  menuOpen: "Menu",
  menuClose: "Close menu",
  menuSignIn: "Sign in / Sign up",
  menuHome: "Home",
  menuAccount: "Account",
  menuFaq: "FAQ",
  menuContact: "Contact",

  modesTitle: "More ways to play",
  comingSoon: "Soon",

  // The home board. Two cover cards over a row of four, and the fourth of
  // those swaps the whole board for the games that are not built yet.
  dailyTitle: "Daily",
  duelTitle: "1v1",
  survivalTitle: "Survival",
  otherGamesTitle: "Other Games",
  comingSoonTitle: "Coming Soon",
  backTitle: "Back",
  footballTitle: "Football",
  basketballTitle: "Basketball",
  screenTitle: "Film & TV",
  inventionTitle: "Inventions",
  whenBornTitle: "Born When?",
  gameLoading: "Getting the first round ready…",
  newGamesTitle: "New games",
  newGamesBlurb: "More modes on the way",

  // One line per card on the home board, shown under the title while the
  // pointer is on it — see `BoardCard` in components/game-board.tsx. The two
  // built games are deliberately absent: they reuse the instruction their own
  // screen already carries (`timelineBlurb`, `comparisonBlurb`) rather than
  // keeping a second copy of the same sentence in five languages.
  cardDailyBlurb: "One event a day, the same one for everybody.",
  cardDuelBlurb: "Play a friend by link, or get matched online at your level.",
  cardOtherBlurb: "Every other way to play, gathered in one place.",
  cardSurvivalBlurb: "Keep answering until the first guess that misses.",
  cardFootballBlurb:
    "The same timeline game, played over the history of football.",
  cardBasketballBlurb: "Dates from the history of basketball, court by court.",
  cardScreenBlurb: "Premieres and milestones from film and television.",
  cardInventionBlurb: "Place the inventions that changed everything.",
  cardWhenBornBlurb: "Guess the year a famous figure was born.",
  cardComingSoonBlurb: "Modes that are still being written.",

  // The round's two side panels, which replaced the verdict painted on the
  // photograph. Left is the result, right is what the event was.
  eventNoteTitle: "About this event",

  // The gate over a photograph marked `is_sensitive`. Two lines rather
  // than one sentence: the first names what is behind the blur, the second
  // is the control. See components/event-visual.tsx.
  sensitiveTitle: "Sensitive content",
  sensitiveReveal: "Click to view",

  // Challenging a date. The "?" in the result panel opens this; the answer is
  // a signed vote on the stored year (later = +1, earlier = -1) that the admin
  // panel sorts events by. See app/actions/challenges.ts.
  challengeOpen: "Report a wrong date",
  challengeAsk: "Is the date incorrect?",
  challengeAction: "Challenge",
  challengeDirection: "Should it be earlier or later?",
  challengeEarlier: "Earlier",
  challengeLater: "Later",
  challengeSending: "Sending...",
  challengeThanks: "Thank you. Your correction has been recorded.",
  challengeFailed: "That could not be sent. Try again.",
  challengeDismiss: "Close",

  // The achievements page. Six rungs on one ladder, climbed with TP; from Gold
  // up each adds quests. The numbers here are copy — the rules that award a
  // badge are lib/game/badge-rules.ts, and retuning one means editing both.
  achievementsTitle: "Achievements",
  achievementsNotLive:
    "Nothing is being counted yet. The rules each badge is given out by are settled, but no finished set is measured against them — so every bar here reads zero.",
  achievementsHowTo: "How to earn it",

  badgeBronze: "Bronze",
  badgeBronzeRule: "10 TP",
  badgeBronzeHow:
    "Your first points. Play a few rounds of any game while signed in.",
  badgeSilver: "Silver",
  badgeSilverRule: "100 TP",
  badgeSilverHow:
    "A few sets in. Every game pays: a round by how close you were, a set for finishing it.",
  badgeGold: "Gold",
  badgeGoldRule: "1,000 TP + 1 quest",
  badgeGoldHow:
    "Points alone stop being enough here. Gold asks for the exact year — more than once.",
  badgeDiamond: "Diamond",
  badgeDiamondRule: "3,000 TP + 2 quests",
  badgeDiamondHow:
    "Range and nerve: exact years across different games, and a survival run that holds.",
  badgeRuby: "Ruby",
  badgeRubyRule: "10,000 TP + 3 quests",
  badgeRubyHow:
    "Three exact years in one set, a flawless comparison set and a week of dailies without a gap.",
  badgeAmethyst: "Amethyst",
  badgeAmethystRule: "30,000 TP + 3 quests",
  badgeAmethystHow:
    "The top of the ladder. Exact years in every date game, a fifty-long survival run and a set with nothing below Great.",


  // --- accounts -------------------------------------------------------------
  // The sign-in form, the account page and the leaderboard. Failures travel as
  // codes (`AuthErrorCode` in app/actions/auth.ts) and become sentences here:
  // Supabase's own messages are English only, and the UI is not.
  authSignInTitle: "Welcome back",
  authSignInBlurb: "Sign in to keep your badges and your place on the board.",
  authSignUpTitle: "Create an account",
  authSignUpBlurb: "A username, an email and a password. Nothing else.",
  authTabSignIn: "Sign in",
  authTabSignUp: "Sign up",
  authUsername: "Username",
  // Stated before the first keystroke, in the words the inline errors use: the
  // field refuses a whole class of characters and a player cannot see which
  // from an empty box. See `authErrUsername*` below for the refusals.
  authUsernameHint:
    "3 to 20 characters. Letters a-z, numbers 0-9 and the underscore (_) only — no spaces, accents or punctuation.",
  authEmail: "Email",
  authPassword: "Password",
  authPasswordHint: "At least 8 characters.",
  authSubmitSignIn: "Sign in",
  authSubmitSignUp: "Create account",
  authWorking: "One moment...",
  authGoogle: "Continue with Google",
  authOr: "or",
  authNoAccount: "No account yet?",
  authHaveAccount: "Already have an account?",
  authConfirmTitle: "Check your inbox",
  authConfirmBody:
    "A confirmation link is on its way to {email}. Open it and your account is ready.",
  authErrInvalidCredentials: "That email and password do not match an account.",
  authErrEmailInvalid: "That does not look like an email address.",
  authErrEmailTaken: "There is already an account with that email.",
  authErrPasswordWeak: "Use at least 8 characters.",
  authErrPasswordMismatch: "Those two passwords do not match.",
  // Four refusals rather than one, because "3-20 characters, a-z, 0-9 and
  // underscores" is not an answer to any of them: a name of the right length
  // needs to hear which character was refused, and a name of the right shape
  // needs to hear the length. `{chars}` is filled with the characters the
  // player actually typed — see `validateUsername` in lib/db/accounts.ts,
  // which is what collects them. `authErrUsernameCharsAny` is the fallback for
  // the one case the list cannot be built (a refusal raised with no detail).
  authErrUsernameShort: "That username is too short — use at least 3 characters.",
  authErrUsernameLong: "That username is too long — use 20 characters at most.",
  authErrUsernameSpaces:
    "Usernames can’t contain spaces. Use an underscore (_) instead.",
  authErrUsernameChars:
    "Usernames can’t contain: {chars} — only letters a-z, numbers 0-9 and the underscore (_) are allowed.",
  authErrUsernameCharsAny:
    "Usernames can only contain letters a-z, numbers 0-9 and the underscore (_) — no spaces, accented or non-Latin letters, and no punctuation.",
  authErrUsernameTaken: "That username is taken.",
  authErrRateLimited: "Too many attempts. Wait a moment and try again.",
  authErrProviderFailed: "Google sign-in is unavailable right now.",
  authErrCurrentPassword: "That is not your current password.",
  authErrPhotoTooLarge: "That photo is over 4 MB. Pick a smaller one.",
  authErrPhotoType: "Use a JPEG, PNG, WebP or HEIC photo.",
  authErrPhotoUnreadable: "That photo could not be read. Try another one.",
  authErrGeneric: "Something went wrong. Try again.",
  authGateNotice: "Badges belong to an account, so this page needs one.",

  accountTitle: "Account",
  accountBlurb: "Your name, how you sign in, and what you have earned.",
  accountUsernameTitle: "Username",
  accountUsernameBlurb: "Shown beside your badge and on the leaderboard.",
  accountUsernameUnset: "Not chosen yet",
  accountEmailTitle: "Email",
  accountEmailBlurb: "The address this account signs in with.",
  accountPasswordTitle: "Password",
  accountPasswordBlurb: "Set a new one. You stay signed in on this device.",
  accountCurrentPassword: "Current password",
  accountNewPassword: "New password",
  accountRepeatPassword: "Repeat it",
  accountPasswordSaved: "Password changed.",
  accountPasswordSet: "Password set. You can now sign in with your email too.",
  accountGoogleOnly:
    "This account signs in with Google. Add a password and you can sign in with your email as well — Google keeps working either way.",
  accountChangeUsername: "Change username",
  accountChangePassword: "Change password",
  accountSetPassword: "Set a password",
  accountCancel: "Cancel",
  accountSave: "Save",
  accountSaved: "Saved",
  accountBadgesTitle: "Badges",
  accountBadgesEarned: "{n} of {total} earned",
  accountSeeBadges: "See the badges",
  accountPhotoTitle: "Profile photo",
  accountPhotoBlurb: "Shown on your account and beside your name on the leaderboard.",
  accountPhotoHint: "JPEG, PNG, WebP or HEIC, up to 4 MB.",
  accountPhotoUpload: "Upload a photo",
  accountPhotoChange: "Change photo",
  accountPhotoRemove: "Remove",
  accountPhotoSaved: "Photo updated.",
  accountPhotoRemoved: "Photo removed.",
  accountPhotoUploading: "Uploading…",
  accountSignOut: "Sign out",
  menuSignOut: "Sign out",

  leaderboardTitle: "Leaderboard",
  leaderboardBlurb: "Players ranked by Tempus Points (TP).",
  leaderboardAllTime: "All time",
  leaderboardMonth: "This month",
  leaderboardRank: "Rank",
  leaderboardPlayer: "Player",
  leaderboardTp: "TP",
  leaderboardPerfects: "Perfects",
  leaderboardEmpty: "No points on this board yet. Sign in and play a set to be the first.",
  leaderboardFailed: "The leaderboard could not be loaded. Try again in a moment.",
  leaderboardYou: "You: #{rank} · {tp} TP",
  // The Chrono Rating board (`?board=rating`). The tab itself reuses
  // `versusRatingName`, so the ladder has one name across the site.
  leaderboardRatingBlurb: "Players ranked by Chrono Rating (CR), earned only in online matches.",
  leaderboardRatingUnit: "CR",
  leaderboardWins: "Wins",
  leaderboardRatingEmpty: "No one has finished an online match yet. Sign in and find an opponent to be the first.",
  leaderboardRatingYou: "You: #{rank} · {n} CR",

  // --- the badges page ------------------------------------------------------
  badgesTitle: "Badges",
  badgesIntro:
    "Six rings that go around your profile picture — one ladder, climbed with Tempus Points (TP). From Gold up, every rung adds quests, and each needs the one below it.",
  badgesProgressTo: "Progress to {badge}",

  // TP, the quests beside each badge, and wearing one. The quest lines take
  // the target as {n}; the rules themselves are lib/game/badge-rules.ts.
  badgesTotalTp: "{n} TP",
  badgeTpRequirement: "Reach {n} TP",
  questPerfects: "{n} Perfects in any date game",
  questPerfectGames: "A Perfect in {n} different games",
  questSurvival: "A survival run of {n}",
  questHistorySetPerfects: "{n} Perfects in one Date Guessing set",
  questCompareFlawless: "A Comparison set with all ten right",
  questDailyStreak: "The daily, {n} days in a row",
  questEveryGamePerfects: "5 Perfects in each of the five date games",
  questTopTierSet: "A set where every answer is Great or Perfect",
  accountRank: "#{n} on the leaderboard",
  pointsEarned: "+{n} TP earned",
  pointsWouldHave: "This was worth {n} TP",
  pointsSignIn: "Sign in to keep your points",
  newBadge: "New badge: {name}",
  revealFailed: "That guess did not reach the server. Try again.",
  badgesLocked: "Locked",
  badgesEarned: "Earned",
  badgesUnrevealed: "Unrevealed",
  badgesCount: "{n} of {total} earned",
  /** The card's one control: it hands back the colour the silhouette is
   *  holding. Named per badge because six of these sit on one rail. */
  badgesWear: "Wear the {badge} badge",
  badgesTakeOff: "Take off the {badge} badge",

  // --- the contact block, on the home page and on `/contact` ---------------
  // `{email}` is substituted with `CONTACT_EMAIL` and rendered as a `mailto:`
  // link *inside* the paragraph — the address is a sentence the block is
  // written around, not a heading of its own, so it is not a key here: an
  // address is not a translation (see lib/contact.ts).
  contactTitle: "Contact Us",
  contactLead:
    "Your ideas matter to us, and they shape what gets built next.",
  contactBlurb:
    "A wrong date, a mode worth building, or a thought about the game: write to {email} and it will be read.",

  // --- /contact, which holds the block above and the tip jar ---------------
  // Which of the two leads is decided by the menu row the visitor came through
  // (see lib/contact.ts). `supportTitle` is the tip jar's own heading and is
  // what its menu row is labelled from, like the three rows that name a page.
  supportTitle: "Buy me a coffee",
  supportLead:
    "Tempus is free, carries no advertising and is written in spare evenings.",
  supportSoon:
    "There is no tip jar to pass yet. When there is a way to send one, this is where it will be.",

  // --- the daily -----------------------------------------------------------
  // Ten questions a day, the same ten for everybody, playable once. The two
  // facts these strings exist to carry are that an account is what makes a
  // score count, and that a finished day cannot be replayed — see
  // lib/game/daily.ts.
  dailyDone: "Daily complete",
  dailyAlreadyToday: "You have already played today.",
  dailyPointsLabel: "Points",
  dailyPointsOf: "{n} of {max}",
  dailyTriple: "Triple points",
  dailyGuestNotice:
    "You are playing as a guest, so nothing is recorded. Sign in and every daily you play counts triple.",
  dailyGuestScore: "Not recorded",
  dailyNextIn: "New questions in {h}h {m}m",
  dailyNextInSoon: "New questions in {m}m",
  dailySubmitFailed: "That could not be sent. Try again.",

  noEvents: "No events available. Check the database connection.",

  // The 404 page (app/not-found.tsx). It is a page of the site like any other —
  // same wordmark, same language — rather than the framework's default, which
  // is an unstyled English sentence on a white ground and reads as the site
  // having fallen over rather than as a URL that is not here.
  notFoundCode: "404",
  notFoundTitle: "That page is not here.",
  notFoundBlurb:
    "The link may be old, or the address mistyped. Everything the site can play is on the home board.",
  notFoundHome: "Back to the board",
  notFoundPlay: "Play a round instead",
} as const;

/** Same keys as English, but every value is a free string. */
export type Dict = { [K in keyof typeof en]: string };

const tr: Dict = {
  tagline: "Tarihin ne zaman olduğunu tahmin et.",
  language: "Dil",

  comparisonTitle: "Karşılaştırma",
  comparisonBlurb: "Asılı duran olay iki tarihten hangisine daha yakın?",
  comparisonHint: "Olayı zaman çizelgesi boyunca kaydır, sonra tahminini kilitle.",

  timelineTitle: "Tarih tahmini",
  timelineBlurb: "Tek bir olayı tarihe yerleştirmek için zaman çizelgesini sürükle.",
  timelineHint: "İşaretçiyi sürükle, sonra tahminini onayla.",

  screenHint: "İşaretçiyi yıla sürükle, sonra tahminini onayla.",
  whenBornHint: "İşaretçiyi yıla sürükle, sonra tahminini onayla.",
  whenBornYearAsked:
    "Her turda kişinin doğum yılı soruluyor — ünlü olduğu yıl değil.",
  fieldLeader: "Lider",
  fieldReligiousFigure: "Dini Önder",
  fieldPhilosopher: "Filozof",
  fieldExplorer: "Kaşif",
  fieldScientist: "Bilim İnsanı",
  fieldInventor: "Mucit",
  fieldWriter: "Yazar",
  fieldArtist: "Sanatçı",
  fieldMusician: "Müzisyen",
  fieldActor: "Oyuncu",
  fieldDirector: "Yönetmen",
  fieldAthlete: "Sporcu",
  fieldEntrepreneur: "Girişimci",
  fieldActivist: "Aktivist",
  screenYearAsked:
    "Filmler vizyona girdiği, diziler ilk yayınlandığı yıla göre tarihlenir.",
  formatFilm: "Film",
  formatSeries: "Dizi",
  submitGuess: "Tahmini onayla",
  comparisonMoveFirst: "Önce kartı sürükle",
  enterDate: "Tarih gir",
  useTimeline: "Zaman çizelgesini kullan",
  yearLabel: "Yıl",
  eraSwitch: "Dönemi değiştir",
  invalidDate: "Lütfen geçerli bir tarih gir.",
  bc: "MÖ",
  bce: "MÖ",
  evolution: "Evrim",
  cosmos: "Evren",
  civilizationEra: "Uygarlık Çağı",
  evolutionEra: "İnsan & Evrim Çağı",
  cosmosEra: "Yerküre & Evren Çağı",
  future: "Gelecek",
  commonEra: "MS",
  commonEraTitle: "Milattan Sonra",
  yearWithEra: "{era} {year}",
  decadeLabel: "{n}'ler",
  centuryLabel: "{n}. yüzyıl",
  millenniumLabel: "{n}. binyıl",

  millionLabel: "milyon",
  billionLabel: "milyar",

  yourGuess: "Tahminin",
  actualDate: "Gerçek tarih",
  yearsOff: "{n} yıl fark",

  verdictPerfect: "Mükemmel",
  verdictGreat: "Harika",
  verdictGood: "İyi",
  verdictBad: "Kötü",
  verdictWayOff: "Çok uzak",
  resultTitle: "Sonucun",
  distanceTitle: "Fark",
  sectionExact: "Tam isabet",
  sectionOff: "1 bölüm",
  sectionsOff: "{n} bölüm",
  correct: "Doğru",
  incorrect: "Pek değil",
  nextRound: "Sonraki tur",
  play: "Oyna",

  moreTitle: "Yakında",
  moreBlurb: "Sırada geliştirilen bölümler.",
  bentoBrowseTitle: "Tüm zaman çizelgesini olay olay gez.",
  bentoLibraryTitle: "Büyüyen bir tarihsel görsel arşivi.",
  bentoDailyTitle: "{highlight} için tasarlandı.",
  bentoDailyHighlight: "Günlük görevler",
  bentoEventsTitle: "{events} daha yolda.",
  bentoEventsCount: "500 yeni olay",
  bentoEventsNote: "(Her hafta yenileri.)",

  explorerHeading: "En iyi tarih oyunu",
  explorerLead: "Oynamanın her yolu ve her turun çekildiği kütüphane.",
  explorerPrev: "Önceki",
  explorerNext: "Sonraki",
  explorerGuessBody:
    "Tek bir fotoğraf ve Dünya’nın oluşumundan bugüne uzanan tek bir zaman çizelgesi. İşaretçiyi olduğunu düşündüğün yıla sürükle, sonra tahminini kilitle. On soru bir set eder.",
  explorerCompareBody:
    "İki sabit tarih ve aralarında asılı duran bir olay. Kesin yıl gerekmez — yalnızca hangisine daha yakın olduğuna karar ver.",
  explorerSurvivalBody:
    "Yanılana kadar devam et. Tek canlı, onluk seti olmayan karşılaştırma turu: olay yanlış tarafa konduğu an tur biter.",
  explorerOtherBody:
    "Futbol, basketbol, film ve dizi — aynı zaman çizelgesi oyunu, her seferinde tek bir konu üzerinden. Yenileri yolda.",
  explorerBadgesBody:
    "Profil fotoğrafının çevresine geçen altı halka. Dördü en iyi onluk setinle tırmandığın bir sıra; diğer ikisi bir kez kazanılır. Takılmış halini görmek için birini seç.",
  explorerBadgesPick: "Bir rütbe seç",
  explorerClose: "Kapat",
  explorerLibraryTitle: "Olay kütüphanesi",
  explorerLibraryBody:
    "Her tur, 4,54 milyar yılı kapsayan ve elden geçirilmiş bir olay kümesinden çekilir; her biri kamuya açık bir fotoğraf ve beş dilde bir adla birlikte.",
  explorerStatEventsValue: "1000+",
  explorerStatEvents: "olay, her biri fotoğrafıyla",
  explorerStatLanguages: "dil, olay adları dahil",
  explorerStatSpan: "yıllık tarih",
  explorerStatSpanValue: "4,54 milyar",

  faqTitle: "Sıkça sorulan sorular",
  faqBlurb: "İlk turdan önce bilinmeye değer şeyler.",
  faqQ1: "Tarihsel olayların tarihleri tamamen doğru mu?",
  faqA1:
    "Tam olarak değil. Tarihsel olayların tarihleri tartışmalı olabilir; ancak tarihçilerin ve genel olarak kamuoyunun en çok kabul ettiği tarihleri kullanmak için elimizden geleni yaptık. Yine de bazı tarihler hatalı olabilir. Şüpheli bulduğun tarihlere itiraz etmeni ve ilgili sorular üzerinden bize geri bildirim göndermeni öneriyoruz. Geri bildirimin, hataları bulmamıza ve içeriğimizin doğruluğunu artırmamıza yardımcı oluyor.",
  faqQ2: "Bir tarihe itiraz edebilir miyim?",
  faqA2:
    "Evet! Her sorunun sonunda, açıklamanın altında bir “İtiraz et” düğmesi bulacaksın. Buna tıklayarak doğru tarihin, gösterilenden daha erken mi yoksa daha geç mi olduğunu düşündüğünü belirtebilirsin. Bu bildirimleri inceliyor ve gerektiğinde sorularımızı güncelliyoruz. Geri bildirimin bizim için son derece değerli ve içeriğimizi geliştirmede büyük rol oynuyor.",
  faqQ3: "Hangi oyun türleri var?",
  faqA3:
    "Sitemizde iki ana oyun türü var. Her birinin, farklı kategorilere uyarlanmış oyun modları dahil olmak üzere birkaç çeşidi bulunuyor; böylece tarihsel olayları oynamanın ve keşfetmenin birden çok yolu oluyor.",
  faqQ4: "Tahminler nasıl puanlanıyor?",
  faqA4:
    "Ham yıl farkına göre değil, olayın kendi yaşına oranla ne kadar şaştığına göre. Her tur beş sonuçtan birine iner — mükemmel, harika, iyi, kötü ya da çok uzak — ve yalnızca sonuncusu ıskadır.",
  faqQ5: "Başarımları nasıl kazanırım?",
  faqA5:
    "Sitemizdeki farklı oyunları oynayarak ve belirli performans eşiklerine ulaşarak başarım kazanabilirsin. Her oyun, ilerlemeni ödüllendiren kendi başarım setini sunabilir.",
  faqQ6: "Bir olayın fotoğrafı yanlış olabilir mi?",
  faqA6:
    "Evet, olay fotoğraflarında küçük hatalar olabilir. Tempus, 1000’den fazla olay içeren büyük bir kütüphane ve bunların bazılarında hata bulunabilir.",
  faqQ7: "Bir arkadaşımla oynayabilir miyim?",
  faqA7:
    "Evet! 1v1 modunda arkadaşına oyun bağlantısını gönderip birlikte oynayabilirsin. “Rakip Bul” düğmesine basarak çevrim içi olarak seviyene uygun bir oyuncuyla da eşleşebilirsin; giriş yaptıysan çevrim içi maçlar sana Kronos Puanı (KP) kazandırır.",
  faqQ8: "Hesap açmam gerekiyor mu?",
  faqA8:
    "Hayır, oyunları hesap açmadan oynayabilirsin. Ancak puan kazanmak, rozetlerin kilidini açmak ve liderlik tablosunda görünmek için kayıt olman gerekiyor.",


  setProgress: "{total} sorudan {n}.",
  seeResults: "Sonuçları gör",
  setComplete: "Set tamamlandı",
  setScore: "{total} sorudan {hits} doğru",
  setBestStreak: "En uzun seri",
  setBreakdown: "Tahminler nasıl gitti",
  playAgain: "Yeniden oyna",
  backHome: "Ana sayfaya dön",
  shareResult: "Sonucu paylaş",
  shareCopied: "Kopyalandı",
  shareFailed: "Kopyalanamadı",
  tryComparison: "Karşılaştırma modunu dene",
  tryTimeline: "Tarih tahminini dene",
  gradeFlawless: "Kusursuz bir set.",
  gradeStrong: "Güçlü bir set.",
  gradeFair: "Gelişime açık.",
  gradeRough: "Tarih uzun bir yol.",

  // --- survival -------------------------------------------------------------
  survivalBlurb: "Cevaplamaya devam et. Tek bir yanlış taraf turu bitirir.",
  survivalCleared: "{n} doğru",
  survivalOver: "Tur bitti",
  survivalCorrect: "doğru cevap",
  survivalPrecision: "İsabet",
  survivalAnswered: "Cevaplanan",
  survivalBestExact: "En uzun tam isabet",
  survivalSequence: "Cevap cevap",
  survivalShareMore: "+{n} önceki",
  survivalGradeLegendary: "Efsanevi bir tur.",
  survivalGradeDeep: "Tarihin derinlerine.",
  survivalGradeSolid: "Sağlam bir tur.",
  survivalGradeShort: "İlk hata çabuk geldi.",

  versusTitle: "Karşı karşıya",
  versusBlurb: "Bir arkadaşınla on tarih yarışı.",
  versusPlayFriend: "Arkadaşınla oyna",
  versusChooseMode: "Hangi oyun?",
  versusModeHistoryBlurb: "Tarihin tamamından on tarih.",
  versusOnlineTitle: "Çevrim içi",
  versusOnlineBlurb: "Saniyeler içinde seviyene uygun bir oyuncuyla eşleş. On tarih, canlı.",
  versusInviteTitle: "Arkadaşını davet et",
  versusInviteBlurb: "Bağlantıyı gönder ya da kodu okutsun. İkiniz de hazır olunca maç başlar.",
  versusCopyLink: "Bağlantıyı kopyala",
  versusLinkCopied: "Bağlantı kopyalandı",
  versusShareWhatsApp: "WhatsApp'ta paylaş",
  versusInviteMessage: "Tempus'ta bana karşı oyna — on tarih, karşı karşıya: {url}",
  versusScanHint: "Ya da bunu okut",
  versusMatchCode: "Maç kodu",
  versusWaitingForOpponent: "Rakibin bekleniyor...",
  versusWaitingToJoin: "Arkadaşının katılması bekleniyor...",
  versusOpponentJoined: "Rakibin geldi.",
  versusReady: "Hazırım",
  versusReadyWaiting: "Onun hazır olması bekleniyor...",
  versusYouAreReady: "Hazırsın",
  versusStarting: "Başlıyor...",
  versusYou: "Sen",
  versusOpponent: "Rakip",
  versusYouLabel: "Sen",
  versusThemLabel: "O",
  versusTimedOut: "Süre doldu",
  versusRoundPoints: "{n} puan",
  versusSecondsLeft: "{n}sn",
  versusAnswered: "Cevapladı",
  versusThinking: "Hâlâ düşünüyor",
  versusNextRoundIn: "Sonraki tur: {n}",
  versusOpponentOffline: "Rakibinin bağlantısı koptu. Süre işlemeye devam ediyor.",
  versusReconnecting: "Yeniden bağlanılıyor...",
  versusYouWin: "Kazandın",
  versusYouLose: "Kaybettin",
  versusDraw: "Berabere",
  versusFinalScore: "{you} - {them}",
  versusRoundsWon: "Kazanılan tur",
  versusRematch: "Tekrar oyna",
  versusRematchAsked: "Kabul etmesi bekleniyor...",
  versusRematchOffer: "Rakibin rövanş istiyor.",
  versusRematchAccept: "Kabul et",
  versusRematchDecline: "Reddet",
  versusRematchDeclined: "Rövanşı reddetti.",
  versusBackHome: "Ana sayfaya dön",
  versusShareMatch: "Sonucu paylaş",
  versusMatchNotFound: "Bu davet artık geçerli değil.",
  versusMatchFull: "Bu maçta zaten iki oyuncu var.",
  versusMatchFinished: "Bu maç çoktan bitti.",
  versusLeft: "Rakibin maçtan ayrıldı.",
  versusSeatLost: "Bu sekme o maçın parçası değil.",
  versusCreateFailed: "Maç başlatılamadı. Tekrar dene.",
  versusJoining: "Katılıyor...",
  versusStatusReady: "Hazır",
  versusStatusHere: "Geldi",
  versusStatusAway: "Henüz yok",
  versusFindTitle: "Rakip Bul",
  versusFindButton: "Rakip Bul",
  versusFindNew: "Yeni Rakip Bul",
  versusSearching: "Rakip aranıyor",
  versusSearchCancel: "Vazgeç",
  versusSearchFailed: "Arama başlatılamadı. Tekrar dene.",
  versusOpponentFound: "Rakip bulundu",
  versusMatchStartsIn: "Başlıyor: {n}",
  versusOpponentLocked: "Rakip tahminini kilitledi",
  versusGuestName: "Misafir",
  versusVs: "vs",
  versusRatingName: "Kronos Puanı",
  versusRatingValue: "{n} KP",
  versusRatingChange: "{delta} KP",
  versusRatingNow: "Yeni puanın: {n} KP",
  versusTierLower: "Alt Küme",
  versusTierMiddle: "Orta Küme",
  versusTierUpper: "Üst Küme",
  versusGuestRatingHint: "Misafir olarak oynuyorsun — Kronos Puanı kazanmak için giriş yap.",
  versusSignInForRating: "Giriş yap",
  versusYouLeft: "Maçtan ayrıldın.",
  versusYourLeague: "Kümen: {league}",
  versusNeedsUsername: "Çevrim içi oynamak için bir kullanıcı adı gerekiyor.",
  versusChooseUsername: "Kullanıcı adı seç",

  // The top-right menu and the coming-soon tiles on the home page.
  menuOpen: "Menü",
  menuClose: "Menüyü kapat",
  menuSignIn: "Giriş yap / Kayıt ol",
  menuHome: "Ana sayfa",
  menuAccount: "Hesap",
  menuFaq: "SSS",
  menuContact: "İletişim",

  modesTitle: "Diğer oyun modları",
  comingSoon: "Yakında",

  dailyTitle: "Günlük",
  duelTitle: "1v1",
  survivalTitle: "Hayatta kalma",
  otherGamesTitle: "Diğer oyunlar",
  comingSoonTitle: "Çok yakında",
  backTitle: "Geri",
  footballTitle: "Futbol",
  basketballTitle: "Basketbol",
  screenTitle: "Film & Dizi",
  inventionTitle: "İcatlar",
  whenBornTitle: "Ne zaman doğdu?",
  gameLoading: "İlk tur hazırlanıyor…",
  newGamesTitle: "Yeni oyunlar",
  newGamesBlurb: "Yeni modlar yolda",

  cardDailyBlurb: "Günde bir olay, herkes için aynı olay.",
  cardDuelBlurb: "Arkadaşınla oyna ya da çevrim içi seviyene uygun bir rakip bul.",
  cardOtherBlurb: "Oynamanın diğer bütün yolları, tek bir yerde.",
  cardSurvivalBlurb: "İlk yanlış tahmine kadar cevaplamaya devam et.",
  cardFootballBlurb: "Aynı zaman çizelgesi oyunu, futbol tarihi üzerinden.",
  cardBasketballBlurb: "Basketbol tarihinden tarihler, parke parke.",
  cardScreenBlurb: "Sinema ve televizyondan galalar ve dönüm noktaları.",
  cardInventionBlurb: "Her şeyi değiştiren icatları yerine koy.",
  cardWhenBornBlurb: "Ünlü bir ismin doğduğu yılı tahmin et.",
  cardComingSoonBlurb: "Hâlâ yazılmakta olan modlar.",

  eventNoteTitle: "Bu olay hakkında",

  sensitiveTitle: "Hassas içerik",
  sensitiveReveal: "Görmek için tıklayın",

  challengeOpen: "Hatalı tarihi bildir",
  challengeAsk: "Tarih yanlış mı?",
  challengeAction: "İtiraz et",
  challengeDirection: "Daha erken mi, daha geç mi olmalı?",
  challengeEarlier: "Daha erken",
  challengeLater: "Daha geç",
  challengeSending: "Gönderiliyor...",
  challengeThanks: "Teşekkürler. Düzeltmen kaydedildi.",
  challengeFailed: "Gönderilemedi. Tekrar dene.",
  challengeDismiss: "Kapat",

  achievementsTitle: "Başarımlar",
  achievementsNotLive:
    "Henüz hiçbir şey sayılmıyor. Rozetlerin hangi kurallarla verileceği belli, ama bitirilen seriler bu kurallara göre ölçülmüyor — yani buradaki her çubuk sıfır gösteriyor.",
  achievementsHowTo: "Nasıl kazanılır",

  badgeBronze: "Bronz",
  badgeBronzeRule: "10 TP",
  badgeBronzeHow:
    "İlk puanların. Giriş yapmışken herhangi bir oyundan birkaç tur oyna.",
  badgeSilver: "Gümüş",
  badgeSilverRule: "100 TP",
  badgeSilverHow:
    "Birkaç set sonra gelir. Her oyun puan verir: tur ne kadar yaklaştığına göre, set de bitirdiğin için.",
  badgeGold: "Altın",
  badgeGoldRule: "1.000 TP + 1 görev",
  badgeGoldHow:
    "Buradan sonra puan tek başına yetmez. Altın, yılı tam olarak bilmeni ister — hem de birden fazla kez.",
  badgeDiamond: "Elmas",
  badgeDiamondRule: "3.000 TP + 2 görev",
  badgeDiamondHow:
    "Genişlik ve soğukkanlılık: farklı oyunlarda tam yıl ve dayanan bir hayatta kalma serisi.",
  badgeRuby: "Yakut",
  badgeRubyRule: "10.000 TP + 3 görev",
  badgeRubyHow:
    "Tek sette üç tam yıl, kusursuz bir karşılaştırma seti ve arası boş kalmayan bir hafta günlük.",
  badgeAmethyst: "Ametist",
  badgeAmethystRule: "30.000 TP + 3 görev",
  badgeAmethystHow:
    "Merdivenin zirvesi. Her tarih oyununda tam yıllar, ellilik bir hayatta kalma serisi ve Harika'nın altına düşmeyen bir set.",


  authSignInTitle: "Tekrar hoş geldin",
  authSignInBlurb: "Rozetlerini ve tablodaki yerini korumak için giriş yap.",
  authSignUpTitle: "Hesap oluştur",
  authSignUpBlurb: "Bir kullanıcı adı, bir e-posta ve bir şifre. Hepsi bu.",
  authTabSignIn: "Giriş yap",
  authTabSignUp: "Kayıt ol",
  authUsername: "Kullanıcı adı",
  authUsernameHint:
    "3-20 karakter. Yalnızca a-z harfleri, 0-9 sayıları ve alt çizgi (_) — boşluk, Türkçe harf ve noktalama kullanılamaz.",
  authEmail: "E-posta",
  authPassword: "Şifre",
  authPasswordHint: "En az 8 karakter.",
  authSubmitSignIn: "Giriş yap",
  authSubmitSignUp: "Hesabı oluştur",
  authWorking: "Bir saniye...",
  authGoogle: "Google ile devam et",
  authOr: "veya",
  authNoAccount: "Hesabın yok mu?",
  authHaveAccount: "Hesabın var mı?",
  authConfirmTitle: "Gelen kutunu kontrol et",
  authConfirmBody:
    "{email} adresine bir onay bağlantısı gönderildi. Bağlantıyı açtığında hesabın hazır.",
  authErrInvalidCredentials: "Bu e-posta ve şifre bir hesapla eşleşmiyor.",
  authErrEmailInvalid: "Bu bir e-posta adresine benzemiyor.",
  authErrEmailTaken: "Bu e-posta ile açılmış bir hesap zaten var.",
  authErrPasswordWeak: "En az 8 karakter kullan.",
  authErrPasswordMismatch: "İki şifre aynı değil.",
  authErrUsernameShort: "Bu kullanıcı adı çok kısa — en az 3 karakter kullan.",
  authErrUsernameLong: "Bu kullanıcı adı çok uzun — en fazla 20 karakter kullan.",
  authErrUsernameSpaces:
    "Kullanıcı adında boşluk olamaz. Yerine alt çizgi (_) kullan.",
  authErrUsernameChars:
    "Kullanıcı adında şunlar olamaz: {chars} — yalnızca a-z harfleri, 0-9 sayıları ve alt çizgi (_) kullanılabilir.",
  authErrUsernameCharsAny:
    "Kullanıcı adında yalnızca a-z harfleri, 0-9 sayıları ve alt çizgi (_) olabilir; Türkçe harfler (ç, ğ, ı, İ, ö, ş, ü), boşluk ve noktalama kullanılamaz.",
  authErrUsernameTaken: "Bu kullanıcı adı alınmış.",
  authErrRateLimited: "Çok fazla deneme. Biraz bekleyip tekrar dene.",
  authErrProviderFailed: "Google ile giriş şu anda kullanılamıyor.",
  authErrCurrentPassword: "Bu, mevcut şifren değil.",
  authErrPhotoTooLarge: "Bu fotoğraf 4 MB'tan büyük. Daha küçük bir tane seç.",
  authErrPhotoType: "JPEG, PNG, WebP veya HEIC bir fotoğraf kullan.",
  authErrPhotoUnreadable: "Bu fotoğraf okunamadı. Başka bir tane dene.",
  authErrGeneric: "Bir şeyler ters gitti. Tekrar dene.",
  authGateNotice: "Rozetler bir hesaba ait olduğu için bu sayfa hesap istiyor.",

  accountTitle: "Hesap",
  accountBlurb: "Adın, nasıl giriş yaptığın ve kazandıkların.",
  accountUsernameTitle: "Kullanıcı adı",
  accountUsernameBlurb: "Rozetinin yanında ve liderlik tablosunda görünür.",
  accountUsernameUnset: "Henüz seçilmedi",
  accountEmailTitle: "E-posta",
  accountEmailBlurb: "Bu hesabın giriş yaptığı adres.",
  accountPasswordTitle: "Şifre",
  accountPasswordBlurb: "Yenisini belirle. Bu cihazda açık kalmaya devam edersin.",
  accountCurrentPassword: "Mevcut şifre",
  accountNewPassword: "Yeni şifre",
  accountRepeatPassword: "Tekrar yaz",
  accountPasswordSaved: "Şifre değiştirildi.",
  accountPasswordSet: "Şifre belirlendi. Artık e-postanla da giriş yapabilirsin.",
  accountGoogleOnly:
    "Bu hesap Google ile giriş yapıyor. Bir şifre belirlersen e-postanla da giriş yapabilirsin — Google her türlü çalışmaya devam eder.",
  accountChangeUsername: "Kullanıcı adını değiştir",
  accountChangePassword: "Şifreyi değiştir",
  accountSetPassword: "Şifre belirle",
  accountCancel: "Vazgeç",
  accountSave: "Kaydet",
  accountSaved: "Kaydedildi",
  accountBadgesTitle: "Rozetler",
  accountBadgesEarned: "{total} rozetten {n} tanesi kazanıldı",
  accountSeeBadges: "Rozetleri gör",
  accountPhotoTitle: "Profil fotoğrafı",
  accountPhotoBlurb: "Hesabında ve liderlik tablosunda adının yanında görünür.",
  accountPhotoHint: "JPEG, PNG, WebP veya HEIC, en fazla 4 MB.",
  accountPhotoUpload: "Fotoğraf yükle",
  accountPhotoChange: "Fotoğrafı değiştir",
  accountPhotoRemove: "Kaldır",
  accountPhotoSaved: "Fotoğraf güncellendi.",
  accountPhotoRemoved: "Fotoğraf kaldırıldı.",
  accountPhotoUploading: "Yükleniyor…",
  accountSignOut: "Çıkış yap",
  menuSignOut: "Çıkış yap",

  leaderboardTitle: "Liderlik tablosu",
  leaderboardBlurb: "Oyuncular Tempus Puanına (TP) göre sıralanır.",
  leaderboardAllTime: "Tüm zamanlar",
  leaderboardMonth: "Bu ay",
  leaderboardRank: "Sıra",
  leaderboardPlayer: "Oyuncu",
  leaderboardTp: "TP",
  leaderboardPerfects: "Mükemmel",
  leaderboardEmpty: "Bu tabloda henüz puan yok. Giriş yap ve ilk olmak için bir set oyna.",
  leaderboardFailed: "Liderlik tablosu yüklenemedi. Birazdan tekrar dene.",
  leaderboardYou: "Sen: #{rank} · {tp} TP",
  leaderboardRatingBlurb: "Oyuncular yalnızca çevrim içi maçlarda kazanılan Kronos Puanına (KP) göre sıralanır.",
  leaderboardRatingUnit: "KP",
  leaderboardWins: "Galibiyet",
  leaderboardRatingEmpty: "Henüz kimse çevrim içi bir maçı bitirmedi. Giriş yap ve ilk olmak için bir rakip bul.",
  leaderboardRatingYou: "Sen: #{rank} · {n} KP",

  badgesTitle: "Rozetler",
  badgesIntro:
    "Profil fotoğrafının çevresine geçen altı halka — Tempus Puanı (TP) ile tırmanılan tek bir merdiven. Altın'dan itibaren her basamak görev ekler ve her biri bir alttakini gerektirir.",
  badgesProgressTo: "{badge} ilerlemesi",
  badgesTotalTp: "{n} TP",
  badgeTpRequirement: "{n} TP'ye ulaş",
  questPerfects: "Herhangi bir tarih oyununda {n} Mükemmel",
  questPerfectGames: "{n} farklı oyunda birer Mükemmel",
  questSurvival: "Hayatta kalmada {n}'lik seri",
  questHistorySetPerfects: "Tek bir Tarih tahmini setinde {n} Mükemmel",
  questCompareFlawless: "Onu da doğru bir Karşılaştırma seti",
  questDailyStreak: "Günlüğü {n} gün üst üste bitir",
  questEveryGamePerfects: "Beş tarih oyununun her birinde 5 Mükemmel",
  questTopTierSet: "Her cevabı Harika veya Mükemmel olan bir set",
  accountRank: "Liderlik tablosunda #{n}",
  pointsEarned: "+{n} TP kazandın",
  pointsWouldHave: "Bu {n} TP ederdi",
  pointsSignIn: "Puanlarını saklamak için giriş yap",
  newBadge: "Yeni rozet: {name}",
  revealFailed: "Tahmin sunucuya ulaşmadı. Tekrar dene.",
  badgesLocked: "Kilitli",
  badgesEarned: "Kazanıldı",
  badgesUnrevealed: "Gizli",
  badgesCount: "{total} rozetten {n} tanesi",
  badgesWear: "{badge} rozetini tak",
  badgesTakeOff: "{badge} rozetini çıkar",

  contactTitle: "Bize ulaş",
  contactLead:
    "Fikirleriniz bizim için değerli; sırada ne yapılacağını onlar belirliyor.",
  contactBlurb:
    "Hatalı bir tarih, yapılmaya değer bir mod ya da oyun hakkında bir düşünce: {email} adresine yaz, okunacak.",

  supportTitle: "Bana bir kahve ısmarla",
  supportLead: "Tempus ücretsiz, reklam taşımıyor ve boş akşamlarda yazılıyor.",
  supportSoon:
    "Henüz uzatılacak bir kahve kavanozu yok. Bir yolu açıldığında burada olacak.",

  dailyDone: "Günlük tamamlandı",
  dailyAlreadyToday: "Bugünü zaten oynadın.",
  dailyPointsLabel: "Puan",
  dailyPointsOf: "{max} üzerinden {n}",
  dailyTriple: "Üç kat puan",
  dailyGuestNotice:
    "Misafir olarak oynuyorsun, bu yüzden hiçbir şey kaydedilmiyor. Giriş yaparsan oynadığın her günlük üç kat sayılır.",
  dailyGuestScore: "Kaydedilmedi",
  dailyNextIn: "Yeni sorulara {h} sa {m} dk",
  dailyNextInSoon: "Yeni sorulara {m} dk",
  dailySubmitFailed: "Gönderilemedi. Tekrar dene.",

  noEvents: "Olay bulunamadı. Veritabanı bağlantısını kontrol et.",

  notFoundCode: "404",
  notFoundTitle: "Bu sayfa burada değil.",
  notFoundBlurb:
    "Bağlantı eski olabilir ya da adres yanlış yazılmış olabilir. Oynanabilecek her şey ana sayfadaki tabloda.",
  notFoundHome: "Tabloya dön",
  notFoundPlay: "Bunun yerine bir tur oyna",
};

const de: Dict = {
  tagline: "Errate, wann Geschichte geschah.",
  language: "Sprache",

  comparisonTitle: "Vergleich",
  comparisonBlurb: "Welchem der beiden Daten liegt das schwebende Ereignis näher?",
  comparisonHint: "Schieb das Ereignis am Zeitstrahl entlang und bestätige dann deine Schätzung.",

  timelineTitle: "Datum erraten",
  timelineBlurb: "Zieh über die Zeitachse, um ein einzelnes Ereignis einzuordnen.",
  timelineHint: "Zieh die Markierung und bestätige deine Schätzung.",

  screenHint: "Zieh die Markierung auf das Jahr und bestätige deine Schätzung.",
  whenBornHint:
    "Zieh die Markierung auf das Jahr und bestätige deine Schätzung.",
  whenBornYearAsked:
    "Gefragt ist immer das Geburtsjahr der Person — nicht das Jahr ihres Ruhms.",
  fieldLeader: "Herrscher",
  fieldReligiousFigure: "Religiöse Figur",
  fieldPhilosopher: "Philosoph",
  fieldExplorer: "Entdecker",
  fieldScientist: "Wissenschaftler",
  fieldInventor: "Erfinder",
  fieldWriter: "Schriftsteller",
  fieldArtist: "Künstler",
  fieldMusician: "Musiker",
  fieldActor: "Schauspieler",
  fieldDirector: "Regisseur",
  fieldAthlete: "Sportler",
  fieldEntrepreneur: "Unternehmer",
  fieldActivist: "Aktivist",
  screenYearAsked:
    "Ein Film zählt ab dem Kinostart, eine Serie ab der Erstausstrahlung.",
  formatFilm: "Film",
  formatSeries: "Serie",
  submitGuess: "Schätzung bestätigen",
  comparisonMoveFirst: "Zuerst die Karte ziehen",
  enterDate: "Datum eingeben",
  useTimeline: "Zeitachse verwenden",
  yearLabel: "Jahr",
  eraSwitch: "Epoche wechseln",
  invalidDate: "Bitte gib ein gültiges Datum ein.",
  bc: "v. Chr.",
  bce: "v. Chr.",
  evolution: "Evolution",
  cosmos: "Kosmos",
  civilizationEra: "Zeitalter der Zivilisation",
  evolutionEra: "Mensch & Evolution",
  cosmosEra: "Erde & Kosmos",
  future: "Zukunft",
  commonEra: "n. Chr.",
  commonEraTitle: "Nach Christus",
  yearWithEra: "{year} {era}",
  decadeLabel: "{n}er-Jahre",
  centuryLabel: "{n}. Jahrhundert",
  millenniumLabel: "{n}. Jahrtausend",

  millionLabel: "Millionen",
  billionLabel: "Milliarden",

  yourGuess: "Deine Schätzung",
  actualDate: "Tatsächliches Datum",
  yearsOff: "{n} Jahre daneben",

  verdictPerfect: "Perfekt",
  verdictGreat: "Stark",
  verdictGood: "Gut",
  verdictBad: "Schwach",
  verdictWayOff: "Weit daneben",
  resultTitle: "Dein Ergebnis",
  distanceTitle: "Abweichung",
  sectionExact: "Genau",
  sectionOff: "1 Abschnitt",
  sectionsOff: "{n} Abschnitte",
  correct: "Richtig",
  incorrect: "Knapp daneben",
  nextRound: "Nächste Runde",
  play: "Spielen",

  moreTitle: "Mehr folgt",
  moreBlurb: "Bereiche, die als Nächstes entstehen.",
  bentoBrowseTitle: "Die ganze Zeitleiste durchstöbern, Ereignis für Ereignis.",
  bentoLibraryTitle: "Eine wachsende Sammlung historischer Bilder.",
  bentoDailyTitle: "Gemacht für {highlight}",
  bentoDailyHighlight: "tägliche Herausforderungen.",
  bentoEventsTitle: "Bis zu {events} sind unterwegs.",
  bentoEventsCount: "500 weitere Ereignisse",
  bentoEventsNote: "(Jede Woche mehr.)",

  explorerHeading: "Das beste Geschichtsspiel",
  explorerLead:
    "Alle Spielweisen und die Bibliothek, aus der jede Runde stammt.",
  explorerPrev: "Zurück",
  explorerNext: "Weiter",
  explorerGuessBody:
    "Ein Foto und ein Zeitstrahl, der von der Entstehung der Erde bis heute reicht. Zieh die Marke auf das Jahr, das du vermutest, und bestätige deinen Tipp. Zehn Fragen ergeben einen Satz.",
  explorerCompareBody:
    "Zwei feste Daten und ein Ereignis dazwischen. Du brauchst kein genaues Jahr — entscheide nur, welchem der beiden es näher liegt.",
  explorerSurvivalBody:
    "Spiel weiter, bis du danebenliegst. Die Vergleichsrunde mit einem Leben und ohne Satz zu zehn: Der Lauf endet, sobald ein Ereignis auf der falschen Seite landet.",
  explorerOtherBody:
    "Fußball, Basketball, Film und Fernsehen — dasselbe Zeitstrahlspiel, jeweils über ein Thema. Weitere folgen.",
  explorerBadgesBody:
    "Sechs Ringe, die dein Profilbild einfassen. Vier bilden einen Rang, den du über deinen besten Zehnersatz erklimmst; die beiden anderen gibt es einmal. Wähl einen, um ihn getragen zu sehen.",
  explorerBadgesPick: "Rang wählen",
  explorerClose: "Schließen",
  explorerLibraryTitle: "Ereignisbibliothek",
  explorerLibraryBody:
    "Jede Runde stammt aus einem geprüften Bestand, der 4,54 Milliarden Jahre umspannt — jedes Ereignis mit gemeinfreiem Foto und einem Namen in fünf Sprachen.",
  explorerStatEventsValue: "1000+",
  explorerStatEvents: "Ereignisse, jedes mit Foto",
  explorerStatLanguages: "Sprachen, Ereignisnamen inklusive",
  explorerStatSpan: "Jahre Geschichte",
  explorerStatSpanValue: "4,54 Mrd.",

  faqTitle: "Häufige Fragen",
  faqBlurb: "Was vor der ersten Runde wissenswert ist.",
  faqQ1: "Sind die Daten historischer Ereignisse völlig korrekt?",
  faqA1:
    "Nicht zwangsläufig. Die Daten historischer Ereignisse können umstritten sein, aber wir haben uns große Mühe gegeben, die von Historikern und von der Allgemeinheit am breitesten anerkannten Daten zu verwenden. Einzelne Angaben können dennoch falsch sein. Wir laden dich ausdrücklich ein, zweifelhafte Daten anzufechten und uns über die betreffende Frage eine Rückmeldung zu schicken. Deine Rückmeldung hilft uns, Fehler zu finden und unsere Inhalte genauer zu machen.",
  faqQ2: "Kann ich ein Datum anfechten?",
  faqA2:
    "Ja! Am Ende jeder Frage findest du unter der Erläuterung die Schaltfläche „Anfechten“. Mit einem Klick darauf sagst du uns, ob das richtige Datum nach deiner Einschätzung früher oder später liegt als das angezeigte. Wir prüfen diese Meldungen und aktualisieren unsere Fragen, wenn es nötig ist. Deine Rückmeldung ist uns sehr wichtig und trägt wesentlich dazu bei, unsere Inhalte zu verbessern.",
  faqQ3: "Welche Arten von Spielen gibt es?",
  faqA3:
    "Auf unserer Seite gibt es zwei Hauptarten von Spielen. Zu jeder gehören mehrere Varianten, darunter Spielmodi für verschiedene Themenbereiche — also viele Wege, zu spielen und historische Ereignisse zu entdecken.",
  faqQ4: "Wie werden Tipps bewertet?",
  faqA4:
    "Nicht nach dem reinen Jahresabstand, sondern danach, wie weit du im Verhältnis zum Alter des Ereignisses danebenliegst. Jede Runde endet in einem von fünf Urteilen — perfekt, stark, gut, schwach oder weit daneben — und nur das letzte gilt als Fehlschlag.",
  faqQ5: "Wie bekomme ich Erfolge?",
  faqA5:
    "Erfolge bekommst du, indem du die verschiedenen Spiele auf unserer Seite spielst und bestimmte Leistungsmarken erreichst. Jedes Spiel kann eigene Erfolge haben, die deinen Fortschritt belohnen.",
  faqQ6: "Kann das Foto eines Ereignisses falsch sein?",
  faqA6:
    "Ja, bei den Ereignisfotos können kleine Fehler vorkommen. Tempus ist eine große Bibliothek mit über 1.000 Ereignissen, und einzelne davon können fehlerhaft sein.",
  faqQ7: "Kann ich mit einem Freund spielen?",
  faqA7:
    "Ja! Im 1v1-Modus schickst du den Link zur Partie weiter und ihr spielt gemeinsam. Über „Gegenüber finden“ spielst du außerdem online gegen jemanden auf deinem Niveau — wenn du angemeldet bist, sammelst du dabei Chrono-Rating.",
  faqQ8: "Muss ich ein Konto anlegen?",
  faqA8:
    "Nein, die Spiele lassen sich ohne Konto spielen. Für Punkte, Abzeichen und einen Platz in der Rangliste ist eine Registrierung aber nötig.",


  setProgress: "{n} von {total}",
  seeResults: "Ergebnis ansehen",
  setComplete: "Satz beendet",
  setScore: "{hits} von {total} richtig",
  setBestStreak: "Längste Serie",
  setBreakdown: "Wie die Schätzungen lagen",
  playAgain: "Noch einmal",
  backHome: "Zurück zur Startseite",
  shareResult: "Ergebnis teilen",
  shareCopied: "Kopiert",
  shareFailed: "Kopieren fehlgeschlagen",
  tryComparison: "Vergleichsmodus probieren",
  tryTimeline: "Datum schätzen probieren",
  gradeFlawless: "Makelloser Satz.",
  gradeStrong: "Starker Satz.",
  gradeFair: "Da geht noch mehr.",
  gradeRough: "Die Geschichte ist lang.",

  // --- survival -------------------------------------------------------------
  survivalBlurb: "Antworte weiter. Eine falsche Seite beendet den Lauf.",
  survivalCleared: "{n} richtig",
  survivalOver: "Lauf beendet",
  survivalCorrect: "richtige Antworten",
  survivalPrecision: "Genauigkeit",
  survivalAnswered: "Beantwortet",
  survivalBestExact: "Längste exakte Serie",
  survivalSequence: "Antwort für Antwort",
  survivalShareMore: "+{n} davor",
  survivalGradeLegendary: "Ein legendärer Lauf.",
  survivalGradeDeep: "Tief in die Geschichte.",
  survivalGradeSolid: "Ein solider Lauf.",
  survivalGradeShort: "Der erste Fehler kam schnell.",

  // The other player is "Gegenüber" in every string below, the seat label
  // included: the "opponent found" card shows a heading and that label
  // together, so a second word for the same role reads as a second person.
  // Neutral, as "Gegner" is not, and still a person, as "Gegenseite" is not.
  versusTitle: "Duell",
  versusBlurb: "Zehn Daten im Wettlauf gegen eine Freundin oder einen Freund.",
  versusPlayFriend: "Gegen Freunde spielen",
  versusChooseMode: "Welches Spiel?",
  versusModeHistoryBlurb: "Zehn Daten aus der ganzen Geschichte.",
  versusOnlineTitle: "Online",
  versusOnlineBlurb: "In Sekunden gegen jemanden auf deinem Niveau. Zehn Daten, live.",
  versusInviteTitle: "Lade jemanden ein",
  versusInviteBlurb: "Schick den Link oder lass den Code scannen. Das Duell startet, sobald ihr beide bereit seid.",
  versusCopyLink: "Link kopieren",
  versusLinkCopied: "Link kopiert",
  versusShareWhatsApp: "Auf WhatsApp teilen",
  versusInviteMessage: "Spiel gegen mich bei Tempus — zehn Daten im Duell: {url}",
  versusScanHint: "Oder das hier scannen",
  versusMatchCode: "Spielcode",
  versusWaitingForOpponent: "Warte auf dein Gegenüber...",
  versusWaitingToJoin: "Warte darauf, dass jemand beitritt...",
  versusOpponentJoined: "Dein Gegenüber ist da.",
  versusReady: "Ich bin bereit",
  versusReadyWaiting: "Warte darauf, dass dein Gegenüber bereit ist...",
  versusYouAreReady: "Du bist bereit",
  versusStarting: "Startet...",
  versusYou: "Du",
  versusOpponent: "Gegenüber",
  versusYouLabel: "Du",
  versusThemLabel: "Sie",
  versusTimedOut: "Zeit abgelaufen",
  versusRoundPoints: "{n} Pkt.",
  versusSecondsLeft: "{n}s",
  versusAnswered: "Geantwortet",
  versusThinking: "Rät noch",
  versusNextRoundIn: "Nächste Runde in {n}",
  versusOpponentOffline: "Die Verbindung deines Gegenübers ist weg. Die Uhr läuft weiter.",
  versusReconnecting: "Verbinde neu...",
  versusYouWin: "Du gewinnst",
  versusYouLose: "Du verlierst",
  versusDraw: "Unentschieden",
  versusFinalScore: "{you} - {them}",
  versusRoundsWon: "Gewonnene Runden",
  versusRematch: "Nochmal spielen",
  versusRematchAsked: "Warte auf die Zusage...",
  versusRematchOffer: "Dein Gegenüber will eine Revanche.",
  versusRematchAccept: "Annehmen",
  versusRematchDecline: "Ablehnen",
  versusRematchDeclined: "Die Revanche wurde abgelehnt.",
  versusBackHome: "Zurück zur Startseite",
  versusShareMatch: "Ergebnis teilen",
  versusMatchNotFound: "Diese Einladung gilt nicht mehr.",
  versusMatchFull: "Dieses Spiel hat schon zwei Mitspielende.",
  versusMatchFinished: "Dieses Spiel ist bereits beendet.",
  versusLeft: "Dein Gegenüber hat das Spiel verlassen.",
  versusSeatLost: "Dieser Tab gehört nicht zu diesem Spiel.",
  versusCreateFailed: "Spiel konnte nicht gestartet werden. Versuch es nochmal.",
  versusJoining: "Trete bei...",
  versusStatusReady: "Bereit",
  versusStatusHere: "Da",
  versusStatusAway: "Noch nicht da",
  versusFindTitle: "Ein Gegenüber finden",
  versusFindButton: "Gegenüber finden",
  versusFindNew: "Neues Gegenüber finden",
  versusSearching: "Suche ein Gegenüber",
  versusSearchCancel: "Abbrechen",
  versusSearchFailed: "Die Suche konnte nicht gestartet werden. Versuch es nochmal.",
  versusOpponentFound: "Gegenüber gefunden",
  versusMatchStartsIn: "Start in {n}",
  versusOpponentLocked: "Dein Gegenüber hat sich festgelegt",
  versusGuestName: "Gast",
  versusVs: "vs.",
  versusRatingName: "Chrono-Rating",
  versusRatingValue: "{n} CR",
  versusRatingChange: "{delta} CR",
  versusRatingNow: "Jetzt {n} CR",
  versusTierLower: "Untere Liga",
  versusTierMiddle: "Mittlere Liga",
  versusTierUpper: "Obere Liga",
  versusGuestRatingHint: "Du spielst als Gast — melde dich an, um Chrono-Rating zu sammeln.",
  versusSignInForRating: "Anmelden",
  versusYouLeft: "Du hast das Spiel verlassen.",
  versusYourLeague: "Deine Liga: {league}",
  versusNeedsUsername: "Für Online-Spiele brauchst du einen Benutzernamen.",
  versusChooseUsername: "Jetzt wählen",

  // The top-right menu and the coming-soon tiles on the home page.
  menuOpen: "Menü",
  menuClose: "Menü schließen",
  menuSignIn: "Anmelden / Registrieren",
  menuHome: "Startseite",
  menuAccount: "Konto",
  menuFaq: "FAQ",
  menuContact: "Kontakt",

  modesTitle: "Mehr Spielarten",
  comingSoon: "Bald",

  dailyTitle: "Täglich",
  duelTitle: "1v1",
  survivalTitle: "Überleben",
  otherGamesTitle: "Weitere Spiele",
  comingSoonTitle: "Demnächst",
  backTitle: "Zurück",
  footballTitle: "Fußball",
  basketballTitle: "Basketball",
  screenTitle: "Film & Serien",
  inventionTitle: "Erfindungen",
  whenBornTitle: "Wann geboren?",
  gameLoading: "Die erste Runde wird vorbereitet…",
  newGamesTitle: "Neue Spiele",
  newGamesBlurb: "Weitere Modi folgen",

  cardDailyBlurb: "Ein Ereignis pro Tag, für alle dasselbe.",
  cardDuelBlurb:
    "Per Link gegen Freunde oder online gegen jemanden auf deinem Niveau.",
  cardOtherBlurb: "Alle anderen Spielarten, an einem Ort versammelt.",
  cardSurvivalBlurb: "Antworte weiter, bis der erste Tipp daneben liegt.",
  cardFootballBlurb:
    "Dasselbe Zeitleisten-Spiel, über die Geschichte des Fußballs.",
  cardBasketballBlurb: "Daten aus der Geschichte des Basketballs.",
  cardScreenBlurb: "Premieren und Meilensteine aus Film und Fernsehen.",
  cardInventionBlurb: "Ordne die Erfindungen ein, die alles verändert haben.",
  cardWhenBornBlurb: "Rate das Geburtsjahr einer berühmten Person.",
  cardComingSoonBlurb: "Modi, die noch geschrieben werden.",

  eventNoteTitle: "Über dieses Ereignis",

  sensitiveTitle: "Sensibler Inhalt",
  sensitiveReveal: "Zum Anzeigen klicken",

  challengeOpen: "Falsches Datum melden",
  challengeAsk: "Ist das Datum falsch?",
  challengeAction: "Einspruch",
  challengeDirection: "Sollte es früher oder später sein?",
  challengeEarlier: "Früher",
  challengeLater: "Später",
  challengeSending: "Wird gesendet...",
  challengeThanks: "Danke. Deine Korrektur wurde erfasst.",
  challengeFailed: "Das konnte nicht gesendet werden. Versuch es erneut.",
  challengeDismiss: "Schließen",

  achievementsTitle: "Erfolge",
  achievementsNotLive:
    "Es wird noch nichts gezählt. Die Regeln, nach denen die Abzeichen vergeben werden, stehen fest, aber keine beendete Serie wird daran gemessen — also steht hier jeder Balken auf null.",
  achievementsHowTo: "So verdienst du es",

  badgeBronze: "Bronze",
  badgeBronzeRule: "10 TP",
  badgeBronzeHow:
    "Deine ersten Punkte. Spiel angemeldet ein paar Runden eines beliebigen Spiels.",
  badgeSilver: "Silber",
  badgeSilverRule: "100 TP",
  badgeSilverHow:
    "Nach ein paar Serien. Jedes Spiel zahlt: eine Runde nach Nähe, eine Serie fürs Beenden.",
  badgeGold: "Gold",
  badgeGoldRule: "1.000 TP + 1 Aufgabe",
  badgeGoldHow:
    "Ab hier reichen Punkte allein nicht mehr. Gold verlangt das genaue Jahr — mehr als einmal.",
  badgeDiamond: "Diamant",
  badgeDiamondRule: "3.000 TP + 2 Aufgaben",
  badgeDiamondHow:
    "Breite und Nerven: genaue Jahre in verschiedenen Spielen und ein Überlebenslauf, der hält.",
  badgeRuby: "Rubin",
  badgeRubyRule: "10.000 TP + 3 Aufgaben",
  badgeRubyHow:
    "Drei genaue Jahre in einer Serie, eine fehlerfreie Vergleichsserie und eine Woche Tägliche ohne Lücke.",
  badgeAmethyst: "Amethyst",
  badgeAmethystRule: "30.000 TP + 3 Aufgaben",
  badgeAmethystHow:
    "Die Spitze der Leiter. Genaue Jahre in jedem Datumsspiel, ein Überlebenslauf von fünfzig und eine Serie ohne Antwort unter Stark.",


  authSignInTitle: "Willkommen zurück",
  authSignInBlurb: "Melde dich an, um deine Abzeichen und deinen Platz zu behalten.",
  authSignUpTitle: "Konto erstellen",
  authSignUpBlurb: "Ein Benutzername, eine E-Mail und ein Passwort. Mehr nicht.",
  authTabSignIn: "Anmelden",
  authTabSignUp: "Registrieren",
  authUsername: "Benutzername",
  authUsernameHint:
    "3 bis 20 Zeichen. Nur Buchstaben a-z, Zahlen 0-9 und der Unterstrich (_) — keine Leerzeichen, Umlaute oder Satzzeichen.",
  authEmail: "E-Mail",
  authPassword: "Passwort",
  authPasswordHint: "Mindestens 8 Zeichen.",
  authSubmitSignIn: "Anmelden",
  authSubmitSignUp: "Konto erstellen",
  authWorking: "Einen Moment...",
  authGoogle: "Mit Google fortfahren",
  authOr: "oder",
  authNoAccount: "Noch kein Konto?",
  authHaveAccount: "Schon ein Konto?",
  authConfirmTitle: "Sieh in dein Postfach",
  authConfirmBody:
    "Ein Bestätigungslink ist auf dem Weg an {email}. Öffne ihn, und dein Konto ist fertig.",
  authErrInvalidCredentials: "E-Mail und Passwort passen zu keinem Konto.",
  authErrEmailInvalid: "Das sieht nicht nach einer E-Mail-Adresse aus.",
  authErrEmailTaken: "Mit dieser E-Mail gibt es bereits ein Konto.",
  authErrPasswordWeak: "Nimm mindestens 8 Zeichen.",
  authErrPasswordMismatch: "Die beiden Passwörter stimmen nicht überein.",
  authErrUsernameShort: "Dieser Benutzername ist zu kurz — nimm mindestens 3 Zeichen.",
  authErrUsernameLong: "Dieser Benutzername ist zu lang — höchstens 20 Zeichen.",
  authErrUsernameSpaces:
    "Benutzernamen dürfen keine Leerzeichen enthalten. Nimm stattdessen einen Unterstrich (_).",
  authErrUsernameChars:
    "Das kann ein Benutzername nicht enthalten: {chars} — erlaubt sind nur Buchstaben a-z, Zahlen 0-9 und der Unterstrich (_).",
  authErrUsernameCharsAny:
    "Benutzernamen dürfen nur Buchstaben a-z, Zahlen 0-9 und den Unterstrich (_) enthalten — keine Umlaute, kein ß, keine Leerzeichen und keine Satzzeichen.",
  authErrUsernameTaken: "Dieser Benutzername ist vergeben.",
  authErrRateLimited: "Zu viele Versuche. Warte kurz und versuche es erneut.",
  authErrProviderFailed: "Die Anmeldung mit Google ist gerade nicht möglich.",
  authErrCurrentPassword: "Das ist nicht dein aktuelles Passwort.",
  authErrPhotoTooLarge: "Das Foto ist größer als 4 MB. Wähle ein kleineres.",
  authErrPhotoType: "Verwende ein JPEG-, PNG-, WebP- oder HEIC-Foto.",
  authErrPhotoUnreadable: "Das Foto konnte nicht gelesen werden. Versuche ein anderes.",
  authErrGeneric: "Da ist etwas schiefgegangen. Versuche es erneut.",
  authGateNotice: "Abzeichen gehören zu einem Konto, also braucht diese Seite eines.",

  accountTitle: "Konto",
  accountBlurb: "Dein Name, deine Anmeldung und was du erreicht hast.",
  accountUsernameTitle: "Benutzername",
  accountUsernameBlurb: "Steht neben deinem Abzeichen und in der Rangliste.",
  accountUsernameUnset: "Noch nicht gewählt",
  accountEmailTitle: "E-Mail",
  accountEmailBlurb: "Die Adresse, mit der sich dieses Konto anmeldet.",
  accountPasswordTitle: "Passwort",
  accountPasswordBlurb: "Setze ein neues. Du bleibst auf diesem Gerät angemeldet.",
  accountCurrentPassword: "Aktuelles Passwort",
  accountNewPassword: "Neues Passwort",
  accountRepeatPassword: "Wiederholen",
  accountPasswordSaved: "Passwort geändert.",
  accountPasswordSet:
    "Passwort gesetzt. Du kannst dich jetzt auch mit deiner E-Mail anmelden.",
  accountChangeUsername: "Benutzernamen ändern",
  accountChangePassword: "Passwort ändern",
  accountSetPassword: "Passwort festlegen",
  accountCancel: "Abbrechen",
  accountGoogleOnly:
    "Dieses Konto meldet sich mit Google an. Lege ein Passwort fest, dann geht die Anmeldung auch per E-Mail — Google funktioniert so oder so weiter.",
  accountSave: "Speichern",
  accountSaved: "Gespeichert",
  accountBadgesTitle: "Abzeichen",
  accountBadgesEarned: "{n} von {total} verdient",
  accountSeeBadges: "Abzeichen ansehen",
  accountPhotoTitle: "Profilfoto",
  accountPhotoBlurb: "Erscheint in deinem Konto und neben deinem Namen in der Bestenliste.",
  accountPhotoHint: "JPEG, PNG, WebP oder HEIC, höchstens 4 MB.",
  accountPhotoUpload: "Foto hochladen",
  accountPhotoChange: "Foto ändern",
  accountPhotoRemove: "Entfernen",
  accountPhotoSaved: "Foto aktualisiert.",
  accountPhotoRemoved: "Foto entfernt.",
  accountPhotoUploading: "Wird hochgeladen…",
  accountSignOut: "Abmelden",
  menuSignOut: "Abmelden",

  leaderboardTitle: "Rangliste",
  leaderboardBlurb: "Spieler nach Tempus-Punkten (TP).",
  leaderboardAllTime: "Gesamt",
  leaderboardMonth: "Diesen Monat",
  leaderboardRank: "Platz",
  leaderboardPlayer: "Spieler",
  leaderboardTp: "TP",
  leaderboardPerfects: "Perfekt",
  leaderboardEmpty: "Noch keine Punkte auf dieser Liste. Melde dich an und spiel eine Serie, um der Erste zu sein.",
  leaderboardFailed: "Die Rangliste konnte nicht geladen werden. Versuch es gleich noch einmal.",
  leaderboardYou: "Du: #{rank} · {tp} TP",
  leaderboardRatingBlurb: "Spieler nach Chrono-Rating (CR), das es nur in Online-Partien gibt.",
  leaderboardRatingUnit: "CR",
  leaderboardWins: "Siege",
  leaderboardRatingEmpty: "Noch hat niemand eine Online-Partie beendet. Melde dich an und such dir einen Gegner, um der Erste zu sein.",
  leaderboardRatingYou: "Du: #{rank} · {n} CR",

  badgesTitle: "Abzeichen",
  badgesIntro:
    "Sechs Ringe um dein Profilbild — eine Leiter, erklommen mit Tempus-Punkten (TP). Ab Gold bringt jede Stufe Aufgaben mit, und jede setzt die darunter voraus.",
  badgesProgressTo: "Fortschritt zu {badge}",
  badgesTotalTp: "{n} TP",
  badgeTpRequirement: "{n} TP erreichen",
  questPerfects: "{n}× Perfekt in einem Datumsspiel",
  questPerfectGames: "Ein Perfekt in {n} verschiedenen Spielen",
  questSurvival: "Ein Überlebenslauf von {n}",
  questHistorySetPerfects: "{n}× Perfekt in einer Serie „Datum erraten“",
  questCompareFlawless: "Eine Vergleichsserie mit allen zehn richtig",
  questDailyStreak: "Die Tägliche, {n} Tage in Folge",
  questEveryGamePerfects: "5× Perfekt in jedem der fünf Datumsspiele",
  questTopTierSet: "Eine Serie, in der jede Antwort Stark oder Perfekt ist",
  accountRank: "#{n} in der Rangliste",
  pointsEarned: "+{n} TP verdient",
  pointsWouldHave: "Das wären {n} TP gewesen",
  pointsSignIn: "Melde dich an, um deine Punkte zu behalten",
  newBadge: "Neues Abzeichen: {name}",
  revealFailed: "Der Tipp hat den Server nicht erreicht. Versuch es noch einmal.",
  badgesLocked: "Gesperrt",
  badgesEarned: "Verdient",
  badgesUnrevealed: "Verborgen",
  badgesCount: "{n} von {total}",
  badgesWear: "Abzeichen {badge} tragen",
  badgesTakeOff: "Abzeichen {badge} ablegen",

  contactTitle: "Kontakt",
  contactLead:
    "Deine Ideen sind uns wichtig — sie bestimmen, was als Nächstes entsteht.",
  contactBlurb:
    "Ein falsches Datum, ein Modus, der gebaut werden sollte, oder ein Gedanke zum Spiel: schreib an {email}, es wird gelesen.",

  supportTitle: "Spendier mir einen Kaffee",
  supportLead:
    "Tempus ist kostenlos, zeigt keine Werbung und entsteht an freien Abenden.",
  supportSoon:
    "Es gibt noch keine Kaffeekasse. Sobald es einen Weg dafür gibt, steht er hier.",

  dailyDone: "Tagesrätsel geschafft",
  dailyAlreadyToday: "Du hast heute schon gespielt.",
  dailyPointsLabel: "Punkte",
  dailyPointsOf: "{n} von {max}",
  dailyTriple: "Dreifache Punkte",
  dailyGuestNotice:
    "Du spielst als Gast, deshalb wird nichts gespeichert. Melde dich an, dann zählt jedes Tagesrätsel dreifach.",
  dailyGuestScore: "Nicht gespeichert",
  dailyNextIn: "Neue Fragen in {h} Std. {m} Min.",
  dailyNextInSoon: "Neue Fragen in {m} Min.",
  dailySubmitFailed: "Das konnte nicht gesendet werden. Versuch es erneut.",

  noEvents: "Keine Ereignisse verfügbar. Prüfe die Datenbankverbindung.",

  notFoundCode: "404",
  notFoundTitle: "Diese Seite gibt es hier nicht.",
  notFoundBlurb:
    "Der Link ist vielleicht alt oder die Adresse vertippt. Alles Spielbare steht auf der Startseite.",
  notFoundHome: "Zurück zur Übersicht",
  notFoundPlay: "Stattdessen eine Runde spielen",
};

const fr: Dict = {
  tagline: "Devine quand l'histoire s'est écrite.",
  language: "Langue",

  comparisonTitle: "Comparaison",
  comparisonBlurb: "De laquelle des deux dates l'événement suspendu est-il le plus proche ?",
  comparisonHint: "Fais glisser l'événement le long de la frise, puis valide ta réponse.",

  timelineTitle: "Devine la date",
  timelineBlurb: "Fais glisser le long de la frise pour situer un événement.",
  timelineHint: "Fais glisser le repère, puis valide ta réponse.",

  screenHint: "Fais glisser le repère sur l’année, puis valide ta réponse.",
  whenBornHint: "Fais glisser le repère sur l’année, puis valide ta réponse.",
  whenBornYearAsked:
    "On demande toujours l’année de naissance — pas celle de la célébrité.",
  fieldLeader: "Dirigeant",
  fieldReligiousFigure: "Figure religieuse",
  fieldPhilosopher: "Philosophe",
  fieldExplorer: "Explorateur",
  fieldScientist: "Scientifique",
  fieldInventor: "Inventeur",
  fieldWriter: "Écrivain",
  fieldArtist: "Artiste",
  fieldMusician: "Musicien",
  fieldActor: "Acteur",
  fieldDirector: "Réalisateur",
  fieldAthlete: "Athlète",
  fieldEntrepreneur: "Entrepreneur",
  fieldActivist: "Militant",
  screenYearAsked:
    "Un film est daté par sa sortie, une série par sa première diffusion.",
  formatFilm: "Film",
  formatSeries: "Série",
  submitGuess: "Valider la réponse",
  comparisonMoveFirst: "Faites d’abord glisser la carte",
  enterDate: "Saisir une date",
  useTimeline: "Utiliser la frise",
  yearLabel: "Année",
  eraSwitch: "Changer d'ère",
  invalidDate: "Saisis une date valide.",
  bc: "av. J.-C.",
  bce: "av. J.-C.",
  evolution: "Évolution",
  cosmos: "Cosmos",
  civilizationEra: "Âge des civilisations",
  evolutionEra: "Humains & évolution",
  cosmosEra: "Terre & cosmos",
  future: "Futur",
  commonEra: "ap. J.-C.",
  commonEraTitle: "Après Jésus-Christ",
  yearWithEra: "{year} {era}",
  decadeLabel: "années {n}",
  centuryLabel: "{n}e siècle",
  millenniumLabel: "{n}e millénaire",

  millionLabel: "millions",
  billionLabel: "milliards",

  yourGuess: "Ta réponse",
  actualDate: "Date réelle",
  yearsOff: "{n} ans d'écart",

  verdictPerfect: "Parfait",
  verdictGreat: "Excellent",
  verdictGood: "Bien",
  verdictBad: "Faible",
  verdictWayOff: "Loin du compte",
  resultTitle: "Ton résultat",
  distanceTitle: "Écart",
  sectionExact: "Exact",
  sectionOff: "1 section",
  sectionsOff: "{n} sections",
  correct: "Exact",
  incorrect: "Presque",
  nextRound: "Tour suivant",
  play: "Jouer",

  moreTitle: "À venir",
  moreBlurb: "Les espaces en cours de création.",
  bentoBrowseTitle: "Parcourez toute la chronologie, événement par événement.",
  bentoLibraryTitle: "Une bibliothèque d'images historiques qui s'agrandit.",
  bentoDailyTitle: "Conçu pour {highlight}",
  bentoDailyHighlight: "les défis quotidiens.",
  bentoEventsTitle: "Jusqu'à {events} arrivent bientôt.",
  bentoEventsCount: "500 nouveaux événements",
  bentoEventsNote: "(De nouveaux chaque semaine.)",

  explorerHeading: "Le meilleur jeu d’histoire",
  explorerLead:
    "Toutes les façons de jouer, et la bibliothèque dont chaque manche est tirée.",
  explorerPrev: "Précédent",
  explorerNext: "Suivant",
  explorerGuessBody:
    "Une photographie et une frise qui va de la formation de la Terre à aujourd’hui. Amenez le curseur sur l’année que vous pensez juste, puis validez. Dix questions forment une série.",
  explorerCompareBody:
    "Deux dates fixes et un événement entre les deux. Pas besoin de l’année exacte : décidez seulement de laquelle il est le plus proche.",
  explorerSurvivalBody:
    "Continuez jusqu’à la première erreur. Le tour de comparaison avec une seule vie et sans série de dix : la partie s’arrête dès qu’un événement est placé du mauvais côté.",
  explorerOtherBody:
    "Football, basket, cinéma et télévision — le même jeu de frise, un sujet à la fois. D’autres arrivent.",
  explorerBadgesBody:
    "Six anneaux qui entourent votre photo de profil. Quatre forment un rang que l’on gravit sur sa meilleure série de dix ; les deux autres s’obtiennent une fois. Choisissez-en un pour le voir porté.",
  explorerBadgesPick: "Choisir un rang",
  explorerClose: "Fermer",
  explorerLibraryTitle: "Bibliothèque d’événements",
  explorerLibraryBody:
    "Chaque manche est tirée d’un fonds vérifié couvrant 4,54 milliards d’années, chaque événement avec une photographie du domaine public et un nom en cinq langues.",
  explorerStatEventsValue: "1000+",
  explorerStatEvents: "événements, tous illustrés",
  explorerStatLanguages: "langues, noms des événements compris",
  explorerStatSpan: "ans d’histoire couverts",
  explorerStatSpanValue: "4,54 Md",

  faqTitle: "Questions fréquentes",
  faqBlurb: "L’essentiel avant la première manche.",
  faqQ1: "Les dates des événements historiques sont-elles parfaitement exactes ?",
  faqA1:
    "Pas nécessairement. Les dates des événements historiques peuvent être débattues, mais nous avons tout fait pour retenir celles qui font le plus largement consensus chez les historiens et dans le grand public. Certaines peuvent malgré tout être inexactes. Nous invitons les joueurs à contester les dates qui leur semblent douteuses et à nous envoyer un retour depuis la question concernée. Vos retours nous aident à repérer les erreurs et à améliorer la justesse de nos contenus.",
  faqQ2: "Puis-je contester une date ?",
  faqA2:
    "Oui ! À la fin de chaque question, sous l’explication, vous trouverez un bouton « Contester ». En cliquant dessus, vous nous indiquez si la bonne date devrait selon vous être antérieure ou postérieure à celle affichée. Nous examinons ces signalements et mettons nos questions à jour lorsque c’est nécessaire. Vos retours nous sont extrêmement précieux et jouent un rôle essentiel dans l’amélioration de nos contenus.",
  faqQ3: "Quels types de jeux propose le site ?",
  faqA3:
    "Le site propose deux grands types de jeux. Chacun compte plusieurs variantes, avec des modes adaptés à différentes catégories : autant de façons de jouer et d’explorer l’histoire.",
  faqQ4: "Comment les réponses sont-elles notées ?",
  faqA4:
    "Par l’écart rapporté à l’âge de l’événement, et non par le nombre d’années brut. Chaque manche aboutit à l’un des cinq verdicts — parfait, excellent, bien, faible ou loin du compte — et seul le dernier compte comme raté.",
  faqQ5: "Comment obtenir des succès ?",
  faqA5:
    "Les succès s’obtiennent en jouant aux différents jeux du site et en atteignant certains paliers de performance. Chaque jeu peut avoir ses propres succès, qui récompensent votre progression.",
  faqQ6: "La photo d’un événement peut-elle être erronée ?",
  faqA6:
    "Oui, de petites erreurs sont possibles parmi les photos. Tempus est une grande bibliothèque de plus de 1 000 événements, et certaines fiches peuvent comporter des erreurs.",
  faqQ7: "Puis-je jouer avec un ami ?",
  faqA7:
    "Oui ! En mode 1v1, il suffit d’envoyer le lien de la partie à votre ami pour jouer ensemble. Avec « Trouver un adversaire », vous pouvez aussi affronter en ligne un joueur de votre niveau ; une fois connecté, vos parties en ligne vous rapportent de la Cote Chrono.",
  faqQ8: "Faut-il créer un compte ?",
  faqA8:
    "Non, les jeux se jouent sans compte. En revanche, l’inscription est nécessaire pour gagner des points, débloquer des badges et apparaître au classement.",


  setProgress: "{n} sur {total}",
  seeResults: "Voir les résultats",
  setComplete: "Série terminée",
  setScore: "{hits} bonnes réponses sur {total}",
  setBestStreak: "Meilleure série",
  setBreakdown: "Précision des estimations",
  playAgain: "Rejouer",
  backHome: "Retour à l'accueil",
  shareResult: "Partager le résultat",
  shareCopied: "Copié",
  shareFailed: "Copie impossible",
  tryComparison: "Essayer le mode comparaison",
  tryTimeline: "Essayer la devinette de date",
  gradeFlawless: "Série parfaite.",
  gradeStrong: "Belle série.",
  gradeFair: "Peut mieux faire.",
  gradeRough: "L'histoire est longue.",

  // --- survival -------------------------------------------------------------
  survivalBlurb: "Continue de répondre. Un seul mauvais côté arrête la partie.",
  survivalCleared: "{n} correctes",
  survivalOver: "Partie terminée",
  survivalCorrect: "bonnes réponses",
  survivalPrecision: "Précision",
  survivalAnswered: "Répondu",
  survivalBestExact: "Meilleure série exacte",
  survivalSequence: "Réponse par réponse",
  survivalShareMore: "+{n} avant",
  survivalGradeLegendary: "Une partie légendaire.",
  survivalGradeDeep: "Loin dans l'histoire.",
  survivalGradeSolid: "Une bonne partie.",
  survivalGradeShort: "La première erreur arrive vite.",

  versusTitle: "Duel",
  versusBlurb: "Dix dates, en course contre un ami.",
  versusPlayFriend: "Jouer contre un ami",
  versusChooseMode: "Quel jeu ?",
  versusModeHistoryBlurb: "Dix dates tirées de toute l'histoire.",
  versusOnlineTitle: "En ligne",
  versusOnlineBlurb: "Un adversaire de ton niveau en quelques secondes. Dix dates, en direct.",
  versusInviteTitle: "Invite un ami",
  versusInviteBlurb: "Envoie le lien ou fais scanner le code. Le duel commence quand vous êtes prêts tous les deux.",
  versusCopyLink: "Copier le lien",
  versusLinkCopied: "Lien copié",
  versusShareWhatsApp: "Partager sur WhatsApp",
  versusInviteMessage: "Affronte-moi sur Tempus — dix dates en duel : {url}",
  versusScanHint: "Ou scanne ceci",
  versusMatchCode: "Code du duel",
  versusWaitingForOpponent: "En attente de ton adversaire...",
  versusWaitingToJoin: "En attente de ton ami...",
  versusOpponentJoined: "Ton adversaire est là.",
  versusReady: "Je suis prêt",
  versusReadyWaiting: "En attente de son signal...",
  versusYouAreReady: "Tu es prêt",
  versusStarting: "Ça commence...",
  versusYou: "Toi",
  versusOpponent: "Adversaire",
  versusYouLabel: "Toi",
  versusThemLabel: "Lui",
  versusTimedOut: "Temps écoulé",
  versusRoundPoints: "{n} pts",
  versusSecondsLeft: "{n}s",
  versusAnswered: "A répondu",
  versusThinking: "Cherche encore",
  versusNextRoundIn: "Manche suivante dans {n}",
  versusOpponentOffline: "Ton adversaire a perdu la connexion. Le chrono continue.",
  versusReconnecting: "Reconnexion...",
  versusYouWin: "Tu gagnes",
  versusYouLose: "Tu perds",
  versusDraw: "Égalité",
  versusFinalScore: "{you} - {them}",
  versusRoundsWon: "Manches gagnées",
  versusRematch: "Rejouer",
  versusRematchAsked: "En attente de sa réponse...",
  versusRematchOffer: "Ton adversaire veut une revanche.",
  versusRematchAccept: "Accepter",
  versusRematchDecline: "Refuser",
  versusRematchDeclined: "La revanche a été refusée.",
  versusBackHome: "Retour à l'accueil",
  versusShareMatch: "Partager le résultat",
  versusMatchNotFound: "Cette invitation n'est plus valable.",
  versusMatchFull: "Ce duel a déjà deux joueurs.",
  versusMatchFinished: "Ce duel est déjà terminé.",
  versusLeft: "Ton adversaire a quitté le duel.",
  versusSeatLost: "Cet onglet ne fait pas partie de ce duel.",
  versusCreateFailed: "Impossible de lancer le duel. Réessaie.",
  versusJoining: "Connexion...",
  versusStatusReady: "Prêt",
  versusStatusHere: "Présent",
  versusStatusAway: "Pas encore là",
  versusFindTitle: "Trouver un adversaire",
  versusFindButton: "Trouver un adversaire",
  versusFindNew: "Nouvel adversaire",
  versusSearching: "Recherche d'un adversaire",
  versusSearchCancel: "Annuler",
  versusSearchFailed: "Impossible de lancer la recherche. Réessaie.",
  versusOpponentFound: "Adversaire trouvé",
  versusMatchStartsIn: "Début dans {n}",
  versusOpponentLocked: "Ton adversaire a validé sa réponse",
  versusGuestName: "Invité",
  versusVs: "contre",
  versusRatingName: "Cote Chrono",
  versusRatingValue: "{n} CR",
  versusRatingChange: "{delta} CR",
  versusRatingNow: "Désormais {n} CR",
  versusTierLower: "Ligue inférieure",
  versusTierMiddle: "Ligue intermédiaire",
  versusTierUpper: "Ligue supérieure",
  versusGuestRatingHint: "Tu joues en invité — connecte-toi pour gagner de la Cote Chrono.",
  versusSignInForRating: "Se connecter",
  versusYouLeft: "Tu as quitté le duel.",
  versusYourLeague: "Ta ligue : {league}",
  versusNeedsUsername: "Il te faut un nom d’utilisateur pour jouer en ligne.",
  versusChooseUsername: "En choisir un",

  // The top-right menu and the coming-soon tiles on the home page.
  menuOpen: "Menu",
  menuClose: "Fermer le menu",
  menuSignIn: "Connexion / Inscription",
  menuHome: "Accueil",
  menuAccount: "Compte",
  menuFaq: "FAQ",
  menuContact: "Contact",

  modesTitle: "Autres façons de jouer",
  comingSoon: "Bientôt",

  dailyTitle: "Quotidien",
  duelTitle: "1v1",
  survivalTitle: "Survie",
  otherGamesTitle: "Autres jeux",
  comingSoonTitle: "Bientôt disponible",
  backTitle: "Retour",
  footballTitle: "Football",
  basketballTitle: "Basket-ball",
  screenTitle: "Films & séries",
  inventionTitle: "Inventions",
  whenBornTitle: "Né quand ?",
  gameLoading: "Préparation du premier tour…",
  newGamesTitle: "Nouveaux jeux",
  newGamesBlurb: "D'autres modes arrivent",

  cardDailyBlurb: "Un événement par jour, le même pour tout le monde.",
  cardDuelBlurb:
    "Défie un ami par lien, ou un adversaire de ton niveau en ligne.",
  cardOtherBlurb: "Toutes les autres façons de jouer, réunies au même endroit.",
  cardSurvivalBlurb: "Continue de répondre jusqu'au premier mauvais placement.",
  cardFootballBlurb: "Le même jeu de frise, sur l'histoire du football.",
  cardBasketballBlurb: "Des dates tirées de l'histoire du basket-ball.",
  cardScreenBlurb: "Sorties et grandes dates du cinéma et de la télévision.",
  cardInventionBlurb: "Situe les inventions qui ont tout changé.",
  cardWhenBornBlurb: "Devine l'année de naissance d'une personnalité.",
  cardComingSoonBlurb: "Des modes encore en écriture.",

  eventNoteTitle: "À propos de cet événement",

  sensitiveTitle: "Contenu sensible",
  sensitiveReveal: "Cliquez pour afficher",

  challengeOpen: "Signaler une date erronée",
  challengeAsk: "La date est-elle incorrecte ?",
  challengeAction: "Contester",
  challengeDirection: "Devrait-elle être plus tôt ou plus tard ?",
  challengeEarlier: "Plus tôt",
  challengeLater: "Plus tard",
  challengeSending: "Envoi...",
  challengeThanks: "Merci. Ta correction a été enregistrée.",
  challengeFailed: "Impossible d'envoyer. Réessaie.",
  challengeDismiss: "Fermer",

  achievementsTitle: "Succès",
  achievementsNotLive:
    "Rien n'est encore compté. Les règles d'attribution de chaque badge sont fixées, mais aucune série terminée n'est mesurée dessus — toutes les barres affichent donc zéro.",
  achievementsHowTo: "Comment l'obtenir",

  badgeBronze: "Bronze",
  badgeBronzeRule: "10 TP",
  badgeBronzeHow:
    "Tes premiers points. Joue quelques manches de n'importe quel jeu en étant connecté.",
  badgeSilver: "Argent",
  badgeSilverRule: "100 TP",
  badgeSilverHow:
    "Après quelques séries. Chaque jeu rapporte : une manche selon ta précision, une série pour l'avoir finie.",
  badgeGold: "Or",
  badgeGoldRule: "1 000 TP + 1 défi",
  badgeGoldHow:
    "À partir d'ici, les points ne suffisent plus. L'or demande l'année exacte — plus d'une fois.",
  badgeDiamond: "Diamant",
  badgeDiamondRule: "3 000 TP + 2 défis",
  badgeDiamondHow:
    "Polyvalence et sang-froid : des années exactes dans plusieurs jeux, et une partie de survie qui tient.",
  badgeRuby: "Rubis",
  badgeRubyRule: "10 000 TP + 3 défis",
  badgeRubyHow:
    "Trois années exactes dans une série, une série de comparaison sans faute et une semaine de quotidiens sans trou.",
  badgeAmethyst: "Améthyste",
  badgeAmethystRule: "30 000 TP + 3 défis",
  badgeAmethystHow:
    "Le sommet de l'échelle. Des années exactes dans chaque jeu de dates, une survie de cinquante et une série sans rien sous Excellent.",


  authSignInTitle: "Content de vous revoir",
  authSignInBlurb: "Connectez-vous pour garder vos badges et votre place au classement.",
  authSignUpTitle: "Créer un compte",
  authSignUpBlurb: "Un nom, une adresse e-mail et un mot de passe. Rien de plus.",
  authTabSignIn: "Se connecter",
  authTabSignUp: "S'inscrire",
  authUsername: "Nom d'utilisateur",
  authUsernameHint:
    "3 à 20 caractères. Uniquement les lettres a-z, les chiffres 0-9 et le tiret bas (_) — ni espaces, ni accents, ni ponctuation.",
  authEmail: "E-mail",
  authPassword: "Mot de passe",
  authPasswordHint: "Au moins 8 caractères.",
  authSubmitSignIn: "Se connecter",
  authSubmitSignUp: "Créer le compte",
  authWorking: "Un instant...",
  authGoogle: "Continuer avec Google",
  authOr: "ou",
  authNoAccount: "Pas encore de compte ?",
  authHaveAccount: "Vous avez déjà un compte ?",
  authConfirmTitle: "Regardez votre boîte de réception",
  authConfirmBody:
    "Un lien de confirmation part vers {email}. Ouvrez-le et votre compte est prêt.",
  authErrInvalidCredentials: "Cet e-mail et ce mot de passe ne correspondent à aucun compte.",
  authErrEmailInvalid: "Cela ne ressemble pas à une adresse e-mail.",
  authErrEmailTaken: "Un compte existe déjà avec cet e-mail.",
  authErrPasswordWeak: "Utilisez au moins 8 caractères.",
  authErrPasswordMismatch: "Les deux mots de passe ne correspondent pas.",
  authErrUsernameShort: "Ce nom est trop court — utilisez au moins 3 caractères.",
  authErrUsernameLong: "Ce nom est trop long — 20 caractères au maximum.",
  authErrUsernameSpaces:
    "Un nom d’utilisateur ne peut pas contenir d’espace. Utilisez un tiret bas (_) à la place.",
  authErrUsernameChars:
    "Un nom d’utilisateur ne peut pas contenir : {chars} — seules les lettres a-z, les chiffres 0-9 et le tiret bas (_) sont acceptés.",
  authErrUsernameCharsAny:
    "Un nom d’utilisateur ne peut contenir que les lettres a-z, les chiffres 0-9 et le tiret bas (_) — ni lettres accentuées, ni espaces, ni ponctuation.",
  authErrUsernameTaken: "Ce nom est déjà pris.",
  authErrRateLimited: "Trop de tentatives. Attendez un moment et réessayez.",
  authErrProviderFailed: "La connexion Google est indisponible pour le moment.",
  authErrCurrentPassword: "Ce n'est pas votre mot de passe actuel.",
  authErrPhotoTooLarge: "Cette photo dépasse 4 Mo. Choisissez-en une plus petite.",
  authErrPhotoType: "Utilisez une photo JPEG, PNG, WebP ou HEIC.",
  authErrPhotoUnreadable: "Cette photo n'a pas pu être lue. Essayez-en une autre.",
  authErrGeneric: "Quelque chose n'a pas fonctionné. Réessayez.",
  authGateNotice: "Les badges appartiennent à un compte : cette page en demande un.",

  accountTitle: "Compte",
  accountBlurb: "Votre nom, votre connexion et ce que vous avez gagné.",
  accountUsernameTitle: "Nom d'utilisateur",
  accountUsernameBlurb: "Affiché à côté de votre badge et au classement.",
  accountUsernameUnset: "Pas encore choisi",
  accountEmailTitle: "E-mail",
  accountEmailBlurb: "L'adresse avec laquelle ce compte se connecte.",
  accountPasswordTitle: "Mot de passe",
  accountPasswordBlurb: "Choisissez-en un nouveau. Vous restez connecté sur cet appareil.",
  accountCurrentPassword: "Mot de passe actuel",
  accountNewPassword: "Nouveau mot de passe",
  accountRepeatPassword: "Répétez-le",
  accountPasswordSaved: "Mot de passe modifié.",
  accountPasswordSet:
    "Mot de passe défini. Vous pouvez désormais vous connecter avec votre e-mail aussi.",
  accountChangeUsername: "Changer de nom d'utilisateur",
  accountChangePassword: "Changer le mot de passe",
  accountSetPassword: "Définir un mot de passe",
  accountCancel: "Annuler",
  accountGoogleOnly:
    "Ce compte se connecte avec Google. Définissez un mot de passe et vous pourrez aussi vous connecter avec votre e-mail — Google continue de fonctionner dans tous les cas.",
  accountSave: "Enregistrer",
  accountSaved: "Enregistré",
  accountBadgesTitle: "Badges",
  accountBadgesEarned: "{n} sur {total} obtenus",
  accountSeeBadges: "Voir les badges",
  accountPhotoTitle: "Photo de profil",
  accountPhotoBlurb: "Affichée sur votre compte et à côté de votre nom dans le classement.",
  accountPhotoHint: "JPEG, PNG, WebP ou HEIC, 4 Mo maximum.",
  accountPhotoUpload: "Ajouter une photo",
  accountPhotoChange: "Changer de photo",
  accountPhotoRemove: "Supprimer",
  accountPhotoSaved: "Photo mise à jour.",
  accountPhotoRemoved: "Photo supprimée.",
  accountPhotoUploading: "Envoi…",
  accountSignOut: "Se déconnecter",
  menuSignOut: "Se déconnecter",

  leaderboardTitle: "Classement",
  leaderboardBlurb: "Les joueurs classés par points Tempus (TP).",
  leaderboardAllTime: "Depuis toujours",
  leaderboardMonth: "Ce mois-ci",
  leaderboardRank: "Rang",
  leaderboardPlayer: "Joueur",
  leaderboardTp: "TP",
  leaderboardPerfects: "Parfaits",
  leaderboardEmpty: "Aucun point sur ce classement pour l'instant. Connecte-toi et joue une série pour être le premier.",
  leaderboardFailed: "Le classement n'a pas pu être chargé. Réessaie dans un instant.",
  leaderboardYou: "Toi : #{rank} · {tp} TP",
  leaderboardRatingBlurb: "Les joueurs classés par cote Chrono (CR), gagnée uniquement en match en ligne.",
  leaderboardRatingUnit: "CR",
  leaderboardWins: "Victoires",
  leaderboardRatingEmpty: "Personne n'a encore terminé de match en ligne. Connecte-toi et trouve un adversaire pour être le premier.",
  leaderboardRatingYou: "Toi : #{rank} · {n} CR",

  badgesTitle: "Badges",
  badgesIntro:
    "Six anneaux autour de ta photo de profil — une seule échelle, gravie avec les points Tempus (TP). À partir de l'or, chaque échelon ajoute des défis, et chacun exige celui d'en dessous.",
  badgesProgressTo: "Progression vers {badge}",
  badgesTotalTp: "{n} TP",
  badgeTpRequirement: "Atteindre {n} TP",
  questPerfects: "{n} Parfaits dans un jeu de dates",
  questPerfectGames: "Un Parfait dans {n} jeux différents",
  questSurvival: "Une survie de {n}",
  questHistorySetPerfects: "{n} Parfaits dans une série « Devine la date »",
  questCompareFlawless: "Une série de comparaison avec les dix bonnes",
  questDailyStreak: "Le quotidien, {n} jours d'affilée",
  questEveryGamePerfects: "5 Parfaits dans chacun des cinq jeux de dates",
  questTopTierSet: "Une série où chaque réponse est Excellent ou Parfait",
  accountRank: "#{n} au classement",
  pointsEarned: "+{n} TP gagnés",
  pointsWouldHave: "Cela valait {n} TP",
  pointsSignIn: "Connecte-toi pour garder tes points",
  newBadge: "Nouveau badge : {name}",
  revealFailed: "Ta réponse n'a pas atteint le serveur. Réessaie.",
  badgesLocked: "Verrouillé",
  badgesEarned: "Obtenu",
  badgesUnrevealed: "Caché",
  badgesCount: "{n} sur {total}",
  badgesWear: "Porter le badge {badge}",
  badgesTakeOff: "Retirer le badge {badge}",

  contactTitle: "Nous contacter",
  contactLead:
    "Vos idées comptent pour nous : elles décident de ce qui sera construit ensuite.",
  contactBlurb:
    "Une date erronée, un mode qui mériterait d'exister, ou une idée sur le jeu : écrivez à {email}, c'est lu.",

  supportTitle: "Offre-moi un café",
  supportLead: "Tempus est gratuit, sans publicité, et s'écrit le soir venu.",
  supportSoon:
    "Il n'y a pas encore de cagnotte à tendre. Dès qu'un moyen existera, il sera ici.",

  dailyDone: "Quotidien terminé",
  dailyAlreadyToday: "Tu as déjà joué aujourd'hui.",
  dailyPointsLabel: "Points",
  dailyPointsOf: "{n} sur {max}",
  dailyTriple: "Points triplés",
  dailyGuestNotice:
    "Tu joues en invité, donc rien n'est enregistré. Connecte-toi et chaque quotidien compte triple.",
  dailyGuestScore: "Non enregistré",
  dailyNextIn: "Nouvelles questions dans {h} h {m} min",
  dailyNextInSoon: "Nouvelles questions dans {m} min",
  dailySubmitFailed: "L'envoi a échoué. Réessaie.",

  noEvents: "Aucun événement disponible. Vérifie la connexion à la base de données.",

  notFoundCode: "404",
  notFoundTitle: "Cette page n’est pas ici.",
  notFoundBlurb:
    "Le lien est peut-être ancien, ou l’adresse mal saisie. Tout ce qui se joue est sur la page d’accueil.",
  notFoundHome: "Retour au tableau",
  notFoundPlay: "Jouer une manche à la place",
};

const es: Dict = {
  tagline: "Adivina cuándo ocurrió la historia.",
  language: "Idioma",

  comparisonTitle: "Comparación",
  comparisonBlurb: "¿A cuál de las dos fechas está más cerca el evento suspendido?",
  comparisonHint: "Desliza el evento por la línea de tiempo y luego confirma tu respuesta.",

  timelineTitle: "Adivina la fecha",
  timelineBlurb: "Arrastra por la línea de tiempo para situar un solo evento.",
  timelineHint: "Arrastra el marcador y confirma tu respuesta.",

  screenHint: "Arrastra el marcador hasta el año y confirma tu respuesta.",
  whenBornHint: "Arrastra el marcador hasta el año y confirma tu respuesta.",
  whenBornYearAsked:
    "Siempre se pide el año de nacimiento, no el año en que fue famoso.",
  fieldLeader: "Líder",
  fieldReligiousFigure: "Figura religiosa",
  fieldPhilosopher: "Filósofo",
  fieldExplorer: "Explorador",
  fieldScientist: "Científico",
  fieldInventor: "Inventor",
  fieldWriter: "Escritor",
  fieldArtist: "Artista",
  fieldMusician: "Músico",
  fieldActor: "Actor",
  fieldDirector: "Director",
  fieldAthlete: "Atleta",
  fieldEntrepreneur: "Empresario",
  fieldActivist: "Activista",
  screenYearAsked:
    "Una película se fecha por su estreno; una serie, por su primera emisión.",
  formatFilm: "Película",
  formatSeries: "Serie",
  submitGuess: "Confirmar respuesta",
  comparisonMoveFirst: "Primero arrastra la tarjeta",
  enterDate: "Introducir una fecha",
  useTimeline: "Usar la línea de tiempo",
  yearLabel: "Año",
  eraSwitch: "Cambiar de era",
  invalidDate: "Introduce una fecha válida.",
  bc: "a. C.",
  bce: "a. C.",
  evolution: "Evolución",
  cosmos: "Cosmos",
  civilizationEra: "Edad de la civilización",
  evolutionEra: "Humanos y evolución",
  cosmosEra: "Tierra y cosmos",
  future: "Futuro",
  commonEra: "d. C.",
  commonEraTitle: "Después de Cristo",
  yearWithEra: "{year} {era}",
  decadeLabel: "años {n}",
  centuryLabel: "siglo {n}",
  millenniumLabel: "{n}.º milenio",

  millionLabel: "millones",
  billionLabel: "mil millones",

  yourGuess: "Tu respuesta",
  actualDate: "Fecha real",
  yearsOff: "{n} años de diferencia",

  verdictPerfect: "Perfecto",
  verdictGreat: "Excelente",
  verdictGood: "Bien",
  verdictBad: "Flojo",
  verdictWayOff: "Muy lejos",
  resultTitle: "Tu resultado",
  distanceTitle: "Diferencia",
  sectionExact: "Exacto",
  sectionOff: "1 sección",
  sectionsOff: "{n} secciones",
  correct: "Correcto",
  incorrect: "Casi",
  nextRound: "Siguiente ronda",
  play: "Jugar",

  moreTitle: "Próximamente",
  moreBlurb: "Las secciones que vienen después.",
  bentoBrowseTitle: "Recorre toda la línea del tiempo, evento por evento.",
  bentoLibraryTitle: "Una biblioteca creciente de imágenes históricas.",
  bentoDailyTitle: "Hecho para {highlight}",
  bentoDailyHighlight: "los retos diarios.",
  bentoEventsTitle: "Hasta {events} están en camino.",
  bentoEventsCount: "500 eventos más",
  bentoEventsNote: "(Más cada semana.)",

  explorerHeading: "El mejor juego de historia",
  explorerLead:
    "Todas las formas de jugar y la biblioteca de la que sale cada ronda.",
  explorerPrev: "Anterior",
  explorerNext: "Siguiente",
  explorerGuessBody:
    "Una fotografía y una línea de tiempo que va desde la formación de la Tierra hasta hoy. Arrastra el marcador al año que creas y confirma tu respuesta. Diez preguntas forman una serie.",
  explorerCompareBody:
    "Dos fechas fijas y un acontecimiento entre ellas. No hace falta el año exacto: solo decide a cuál de las dos queda más cerca.",
  explorerSurvivalBody:
    "Sigue respondiendo hasta fallar. La ronda de comparación con una sola vida y sin serie de diez: la partida termina en cuanto un evento cae en el lado equivocado.",
  explorerOtherBody:
    "Fútbol, baloncesto, cine y televisión: el mismo juego de línea de tiempo sobre un tema cada vez. Vienen más.",
  explorerBadgesBody:
    "Seis anillos que rodean tu foto de perfil. Cuatro forman un rango que se sube con tu mejor serie de diez; los otros dos se ganan una vez. Elige uno para verlo puesto.",
  explorerBadgesPick: "Elige un rango",
  explorerClose: "Cerrar",
  explorerLibraryTitle: "Biblioteca de acontecimientos",
  explorerLibraryBody:
    "Cada ronda sale de un fondo revisado que abarca 4540 millones de años, con una fotografía de dominio público y un nombre en cinco idiomas para cada acontecimiento.",
  explorerStatEventsValue: "1000+",
  explorerStatEvents: "acontecimientos, todos con foto",
  explorerStatLanguages: "idiomas, nombres incluidos",
  explorerStatSpan: "años de historia",
  explorerStatSpanValue: "4540 M",

  faqTitle: "Preguntas frecuentes",
  faqBlurb: "Lo que conviene saber antes de la primera ronda.",
  faqQ1: "¿Las fechas de los acontecimientos históricos son totalmente exactas?",
  faqA1:
    "No necesariamente. Las fechas de los acontecimientos históricos pueden ser discutidas, pero hemos hecho todo lo posible por usar las más aceptadas por los historiadores y por el público en general. Aun así, alguna puede ser inexacta. Animamos a los jugadores a impugnar las fechas que les parezcan dudosas y a enviarnos sus comentarios desde la pregunta correspondiente. Tus comentarios nos ayudan a detectar errores y a mejorar la precisión de nuestros contenidos.",
  faqQ2: "¿Puedo impugnar una fecha?",
  faqA2:
    "¡Sí! Al final de cada pregunta, debajo de la explicación, encontrarás el botón «Impugnar». Al pulsarlo puedes indicarnos si crees que la fecha correcta debería ser anterior o posterior a la mostrada. Revisamos estos avisos y actualizamos nuestras preguntas cuando es necesario. Tus comentarios son muy importantes para nosotros y resultan decisivos para mejorar los contenidos.",
  faqQ3: "¿Qué tipos de juegos hay?",
  faqA3:
    "La web tiene dos tipos principales de juego. Cada uno cuenta con varias variantes, incluidos modos adaptados a distintas categorías, así que hay muchas formas de jugar y de explorar la historia.",
  faqQ4: "¿Cómo se puntúan las respuestas?",
  faqA4:
    "Por lo que te desvías en relación con la edad del acontecimiento, no por los años en bruto. Cada ronda termina en uno de cinco veredictos —perfecto, excelente, bien, flojo o muy lejos— y solo el último cuenta como fallo.",
  faqQ5: "¿Cómo consigo logros?",
  faqA5:
    "Los logros se consiguen jugando a los distintos juegos de la web y alcanzando ciertas marcas de rendimiento. Cada juego puede tener sus propios logros, que premian tu progreso.",
  faqQ6: "¿Puede estar mal la foto de un acontecimiento?",
  faqA6:
    "Sí, puede haber pequeños errores entre las fotos. Tempus es una biblioteca grande, con más de 1000 acontecimientos, y en algunos puede haber fallos.",
  faqQ7: "¿Puedo jugar con un amigo?",
  faqA7:
    "¡Sí! En el modo 1v1 puedes enviarle el enlace de la partida a tu amigo y jugar juntos. Con «Buscar rival» también puedes enfrentarte en línea a alguien de tu nivel; si inicias sesión, ganas Puntuación Chrono con las partidas en línea.",
  faqQ8: "¿Hace falta crear una cuenta?",
  faqA8:
    "No, puedes jugar sin cuenta. Pero necesitas registrarte para ganar puntos, desbloquear insignias y aparecer en la clasificación.",


  setProgress: "{n} de {total}",
  seeResults: "Ver resultados",
  setComplete: "Serie completada",
  setScore: "{hits} de {total} correctas",
  setBestStreak: "Mejor racha",
  setBreakdown: "Cómo fueron las estimaciones",
  playAgain: "Jugar otra vez",
  backHome: "Volver al inicio",
  shareResult: "Compartir resultado",
  shareCopied: "Copiado",
  shareFailed: "No se pudo copiar",
  tryComparison: "Probar el modo comparación",
  tryTimeline: "Probar adivinar la fecha",
  gradeFlawless: "Serie perfecta.",
  gradeStrong: "Buena serie.",
  gradeFair: "Se puede mejorar.",
  gradeRough: "La historia es larga.",

  // --- survival -------------------------------------------------------------
  survivalBlurb: "Sigue respondiendo. Un solo lado equivocado termina la partida.",
  survivalCleared: "{n} correctas",
  survivalOver: "Partida terminada",
  survivalCorrect: "respuestas correctas",
  survivalPrecision: "Precisión",
  survivalAnswered: "Respondidas",
  survivalBestExact: "Mejor racha exacta",
  survivalSequence: "Respuesta a respuesta",
  survivalShareMore: "+{n} anteriores",
  survivalGradeLegendary: "Una partida legendaria.",
  survivalGradeDeep: "Muy adentro en la historia.",
  survivalGradeSolid: "Una partida sólida.",
  survivalGradeShort: "El primer fallo llega rápido.",

  versusTitle: "Duelo",
  versusBlurb: "Diez fechas a contrarreloj con un amigo.",
  versusPlayFriend: "Jugar con un amigo",
  versusChooseMode: "¿Qué juego?",
  versusModeHistoryBlurb: "Diez fechas de toda la historia.",
  versusOnlineTitle: "En línea",
  versusOnlineBlurb: "Emparejado en segundos con alguien de tu nivel. Diez fechas, en directo.",
  versusInviteTitle: "Invita a alguien",
  versusInviteBlurb: "Envía el enlace o deja que escaneen el código. El duelo empieza cuando los dos estéis listos.",
  versusCopyLink: "Copiar enlace",
  versusLinkCopied: "Enlace copiado",
  versusShareWhatsApp: "Compartir por WhatsApp",
  versusInviteMessage: "Juega contra mí en Tempus — diez fechas en duelo: {url}",
  versusScanHint: "O escanea esto",
  versusMatchCode: "Código del duelo",
  versusWaitingForOpponent: "Esperando a tu rival...",
  versusWaitingToJoin: "Esperando a que se una tu amigo...",
  versusOpponentJoined: "Tu rival ya está aquí.",
  versusReady: "Estoy listo",
  versusReadyWaiting: "Esperando a que esté listo...",
  versusYouAreReady: "Estás listo",
  versusStarting: "Empezando...",
  versusYou: "Tú",
  versusOpponent: "Rival",
  versusYouLabel: "Tú",
  versusThemLabel: "Rival",
  versusTimedOut: "Sin tiempo",
  versusRoundPoints: "{n} pts",
  versusSecondsLeft: "{n}s",
  versusAnswered: "Ha respondido",
  versusThinking: "Sigue pensando",
  versusNextRoundIn: "Siguiente ronda en {n}",
  versusOpponentOffline: "Tu rival ha perdido la conexión. El reloj sigue corriendo.",
  versusReconnecting: "Reconectando...",
  versusYouWin: "Ganas",
  versusYouLose: "Pierdes",
  versusDraw: "Empate",
  versusFinalScore: "{you} - {them}",
  versusRoundsWon: "Rondas ganadas",
  versusRematch: "Jugar otra vez",
  versusRematchAsked: "Esperando su respuesta...",
  versusRematchOffer: "Tu rival quiere la revancha.",
  versusRematchAccept: "Aceptar",
  versusRematchDecline: "Rechazar",
  versusRematchDeclined: "Ha rechazado la revancha.",
  versusBackHome: "Volver al inicio",
  versusShareMatch: "Compartir resultado",
  versusMatchNotFound: "Esa invitación ya no es válida.",
  versusMatchFull: "Ese duelo ya tiene dos jugadores.",
  versusMatchFinished: "Ese duelo ya ha terminado.",
  versusLeft: "Tu rival ha dejado el duelo.",
  versusSeatLost: "Esta pestaña no forma parte de ese duelo.",
  versusCreateFailed: "No se ha podido crear el duelo. Inténtalo otra vez.",
  versusJoining: "Entrando...",
  versusStatusReady: "Listo",
  versusStatusHere: "Presente",
  versusStatusAway: "Aún no está",
  versusFindTitle: "Buscar rival",
  versusFindButton: "Buscar rival",
  versusFindNew: "Buscar otro rival",
  versusSearching: "Buscando rival",
  versusSearchCancel: "Cancelar",
  versusSearchFailed: "No se ha podido iniciar la búsqueda. Inténtalo otra vez.",
  versusOpponentFound: "Rival encontrado",
  versusMatchStartsIn: "Empieza en {n}",
  versusOpponentLocked: "Tu rival ya ha fijado su respuesta",
  versusGuestName: "Invitado",
  versusVs: "vs",
  versusRatingName: "Puntuación Chrono",
  versusRatingValue: "{n} CR",
  versusRatingChange: "{delta} CR",
  versusRatingNow: "Ahora {n} CR",
  versusTierLower: "Liga baja",
  versusTierMiddle: "Liga media",
  versusTierUpper: "Liga alta",
  versusGuestRatingHint: "Juegas como invitado — inicia sesión para ganar Puntuación Chrono.",
  versusSignInForRating: "Iniciar sesión",
  versusYouLeft: "Has abandonado el duelo.",
  versusYourLeague: "Tu liga: {league}",
  versusNeedsUsername: "Para jugar en línea necesitas un nombre de usuario.",
  versusChooseUsername: "Elegir uno",

  // The top-right menu and the coming-soon tiles on the home page.
  menuOpen: "Menú",
  menuClose: "Cerrar el menú",
  menuSignIn: "Iniciar sesión / Registrarse",
  menuHome: "Inicio",
  menuAccount: "Cuenta",
  menuFaq: "Preguntas frecuentes",
  menuContact: "Contacto",

  modesTitle: "Más formas de jugar",
  comingSoon: "Pronto",

  dailyTitle: "Diario",
  duelTitle: "1v1",
  survivalTitle: "Supervivencia",
  otherGamesTitle: "Otros juegos",
  comingSoonTitle: "Muy pronto",
  backTitle: "Volver",
  footballTitle: "Fútbol",
  basketballTitle: "Baloncesto",
  screenTitle: "Cine y series",
  inventionTitle: "Inventos",
  whenBornTitle: "¿Cuándo nació?",
  gameLoading: "Preparando la primera ronda…",
  newGamesTitle: "Juegos nuevos",
  newGamesBlurb: "Llegan más modos",

  cardDailyBlurb: "Un evento al día, el mismo para todo el mundo.",
  cardDuelBlurb:
    "Reta a un amigo con un enlace o busca en línea un rival de tu nivel.",
  cardOtherBlurb: "Todas las demás formas de jugar, reunidas en un sitio.",
  cardSurvivalBlurb: "Sigue respondiendo hasta el primer fallo.",
  cardFootballBlurb:
    "El mismo juego de la línea de tiempo, sobre la historia del fútbol.",
  cardBasketballBlurb: "Fechas de la historia del baloncesto.",
  cardScreenBlurb: "Estrenos e hitos del cine y la televisión.",
  cardInventionBlurb: "Sitúa los inventos que lo cambiaron todo.",
  cardWhenBornBlurb: "Adivina el año en que nació una figura famosa.",
  cardComingSoonBlurb: "Modos que todavía se están escribiendo.",

  eventNoteTitle: "Sobre este evento",

  sensitiveTitle: "Contenido sensible",
  sensitiveReveal: "Haz clic para ver",

  challengeOpen: "Informar de una fecha errónea",
  challengeAsk: "¿La fecha es incorrecta?",
  challengeAction: "Impugnar",
  challengeDirection: "¿Debería ser antes o después?",
  challengeEarlier: "Antes",
  challengeLater: "Después",
  challengeSending: "Enviando...",
  challengeThanks: "Gracias. Tu corrección ha quedado registrada.",
  challengeFailed: "No se pudo enviar. Inténtalo de nuevo.",
  challengeDismiss: "Cerrar",

  achievementsTitle: "Logros",
  achievementsNotLive:
    "Todavía no se cuenta nada. Las reglas con las que se entrega cada insignia están decididas, pero ninguna serie terminada se mide con ellas, así que todas las barras marcan cero.",
  achievementsHowTo: "Cómo conseguirla",

  badgeBronze: "Bronce",
  badgeBronzeRule: "10 TP",
  badgeBronzeHow:
    "Tus primeros puntos. Juega unas rondas de cualquier juego con la sesión iniciada.",
  badgeSilver: "Plata",
  badgeSilverRule: "100 TP",
  badgeSilverHow:
    "Tras unas cuantas series. Cada juego paga: una ronda según lo cerca que estuviste, una serie por terminarla.",
  badgeGold: "Oro",
  badgeGoldRule: "1.000 TP + 1 reto",
  badgeGoldHow:
    "A partir de aquí los puntos ya no bastan. El oro pide el año exacto, más de una vez.",
  badgeDiamond: "Diamante",
  badgeDiamondRule: "3.000 TP + 2 retos",
  badgeDiamondHow:
    "Amplitud y temple: años exactos en juegos distintos y una partida de supervivencia que aguante.",
  badgeRuby: "Rubí",
  badgeRubyRule: "10.000 TP + 3 retos",
  badgeRubyHow:
    "Tres años exactos en una serie, una serie de comparación perfecta y una semana de diarios sin huecos.",
  badgeAmethyst: "Amatista",
  badgeAmethystRule: "30.000 TP + 3 retos",
  badgeAmethystHow:
    "La cima de la escalera. Años exactos en cada juego de fechas, una supervivencia de cincuenta y una serie sin nada por debajo de Excelente.",


  authSignInTitle: "Bienvenido de nuevo",
  authSignInBlurb: "Inicia sesión para conservar tus insignias y tu puesto en la tabla.",
  authSignUpTitle: "Crear una cuenta",
  authSignUpBlurb: "Un nombre, un correo y una contraseña. Nada más.",
  authTabSignIn: "Iniciar sesión",
  authTabSignUp: "Registrarse",
  authUsername: "Nombre de usuario",
  authUsernameHint:
    "De 3 a 20 caracteres. Solo letras a-z, números 0-9 y el guion bajo (_): sin espacios, acentos ni signos de puntuación.",
  authEmail: "Correo",
  authPassword: "Contraseña",
  authPasswordHint: "Al menos 8 caracteres.",
  authSubmitSignIn: "Iniciar sesión",
  authSubmitSignUp: "Crear la cuenta",
  authWorking: "Un momento...",
  authGoogle: "Continuar con Google",
  authOr: "o",
  authNoAccount: "¿Todavía sin cuenta?",
  authHaveAccount: "¿Ya tienes cuenta?",
  authConfirmTitle: "Mira tu bandeja de entrada",
  authConfirmBody:
    "Va en camino un enlace de confirmación a {email}. Ábrelo y tu cuenta estará lista.",
  authErrInvalidCredentials: "Ese correo y esa contraseña no coinciden con ninguna cuenta.",
  authErrEmailInvalid: "Eso no parece una dirección de correo.",
  authErrEmailTaken: "Ya existe una cuenta con ese correo.",
  authErrPasswordWeak: "Usa al menos 8 caracteres.",
  authErrPasswordMismatch: "Las dos contraseñas no coinciden.",
  authErrUsernameShort: "Ese nombre es demasiado corto: usa al menos 3 caracteres.",
  authErrUsernameLong: "Ese nombre es demasiado largo: 20 caracteres como máximo.",
  authErrUsernameSpaces:
    "El nombre de usuario no puede llevar espacios. Usa un guion bajo (_) en su lugar.",
  authErrUsernameChars:
    "El nombre de usuario no puede contener: {chars}. Solo se admiten letras a-z, números 0-9 y el guion bajo (_).",
  authErrUsernameCharsAny:
    "El nombre de usuario solo puede contener letras a-z, números 0-9 y el guion bajo (_): sin acentos, ñ, espacios ni signos de puntuación.",
  authErrUsernameTaken: "Ese nombre ya está ocupado.",
  authErrRateLimited: "Demasiados intentos. Espera un momento y vuelve a probar.",
  authErrProviderFailed: "El inicio de sesión con Google no está disponible ahora.",
  authErrCurrentPassword: "Esa no es tu contraseña actual.",
  authErrPhotoTooLarge: "Esa foto supera 4 MB. Elige una más pequeña.",
  authErrPhotoType: "Usa una foto JPEG, PNG, WebP o HEIC.",
  authErrPhotoUnreadable: "No se pudo leer esa foto. Prueba con otra.",
  authErrGeneric: "Algo ha ido mal. Inténtalo otra vez.",
  authGateNotice: "Las insignias pertenecen a una cuenta, así que esta página pide una.",

  accountTitle: "Cuenta",
  accountBlurb: "Tu nombre, cómo inicias sesión y lo que has conseguido.",
  accountUsernameTitle: "Nombre de usuario",
  accountUsernameBlurb: "Se muestra junto a tu insignia y en la clasificación.",
  accountUsernameUnset: "Sin elegir todavía",
  accountEmailTitle: "Correo",
  accountEmailBlurb: "La dirección con la que entra esta cuenta.",
  accountPasswordTitle: "Contraseña",
  accountPasswordBlurb: "Pon una nueva. Seguirás con la sesión abierta en este dispositivo.",
  accountCurrentPassword: "Contraseña actual",
  accountNewPassword: "Nueva contraseña",
  accountRepeatPassword: "Repítela",
  accountPasswordSaved: "Contraseña cambiada.",
  accountPasswordSet:
    "Contraseña establecida. Ahora también puedes entrar con tu correo.",
  accountChangeUsername: "Cambiar el nombre de usuario",
  accountChangePassword: "Cambiar la contraseña",
  accountSetPassword: "Establecer una contraseña",
  accountCancel: "Cancelar",
  accountGoogleOnly:
    "Esta cuenta entra con Google. Si estableces una contraseña también podrás entrar con tu correo; Google seguirá funcionando igual.",
  accountSave: "Guardar",
  accountSaved: "Guardado",
  accountBadgesTitle: "Insignias",
  accountBadgesEarned: "{n} de {total} conseguidas",
  accountSeeBadges: "Ver las insignias",
  accountPhotoTitle: "Foto de perfil",
  accountPhotoBlurb: "Se muestra en tu cuenta y junto a tu nombre en la clasificación.",
  accountPhotoHint: "JPEG, PNG, WebP o HEIC, hasta 4 MB.",
  accountPhotoUpload: "Subir una foto",
  accountPhotoChange: "Cambiar foto",
  accountPhotoRemove: "Quitar",
  accountPhotoSaved: "Foto actualizada.",
  accountPhotoRemoved: "Foto eliminada.",
  accountPhotoUploading: "Subiendo…",
  accountSignOut: "Cerrar sesión",
  menuSignOut: "Cerrar sesión",

  leaderboardTitle: "Clasificación",
  leaderboardBlurb: "Jugadores ordenados por puntos Tempus (TP).",
  leaderboardAllTime: "Histórico",
  leaderboardMonth: "Este mes",
  leaderboardRank: "Puesto",
  leaderboardPlayer: "Jugador",
  leaderboardTp: "TP",
  leaderboardPerfects: "Perfectos",
  leaderboardEmpty: "Todavía no hay puntos en esta tabla. Inicia sesión y juega una serie para ser el primero.",
  leaderboardFailed: "No se pudo cargar la clasificación. Inténtalo de nuevo en un momento.",
  leaderboardYou: "Tú: #{rank} · {tp} TP",
  leaderboardRatingBlurb: "Jugadores ordenados por puntuación Chrono (CR), que solo se gana en partidas en línea.",
  leaderboardRatingUnit: "CR",
  leaderboardWins: "Victorias",
  leaderboardRatingEmpty: "Nadie ha terminado todavía una partida en línea. Inicia sesión y busca un rival para ser el primero.",
  leaderboardRatingYou: "Tú: #{rank} · {n} CR",

  badgesTitle: "Insignias",
  badgesIntro:
    "Seis anillos alrededor de tu foto de perfil: una sola escalera que se sube con puntos Tempus (TP). Desde el oro, cada peldaño añade retos, y cada uno exige el anterior.",
  badgesProgressTo: "Avance hacia {badge}",
  badgesTotalTp: "{n} TP",
  badgeTpRequirement: "Llegar a {n} TP",
  questPerfects: "{n} Perfectos en un juego de fechas",
  questPerfectGames: "Un Perfecto en {n} juegos distintos",
  questSurvival: "Una supervivencia de {n}",
  questHistorySetPerfects: "{n} Perfectos en una serie de «Adivina la fecha»",
  questCompareFlawless: "Una serie de comparación con las diez bien",
  questDailyStreak: "El diario, {n} días seguidos",
  questEveryGamePerfects: "5 Perfectos en cada uno de los cinco juegos de fechas",
  questTopTierSet: "Una serie en la que cada respuesta es Excelente o Perfecto",
  accountRank: "#{n} en la clasificación",
  pointsEarned: "+{n} TP ganados",
  pointsWouldHave: "Esto valía {n} TP",
  pointsSignIn: "Inicia sesión para guardar tus puntos",
  newBadge: "Insignia nueva: {name}",
  revealFailed: "Tu respuesta no llegó al servidor. Inténtalo de nuevo.",
  badgesLocked: "Bloqueada",
  badgesEarned: "Conseguida",
  badgesUnrevealed: "Oculta",
  badgesCount: "{n} de {total}",
  badgesWear: "Ponerse la insignia {badge}",
  badgesTakeOff: "Quitarse la insignia {badge}",

  contactTitle: "Contáctanos",
  contactLead:
    "Tus ideas nos importan: deciden qué se construye a continuación.",
  contactBlurb:
    "Una fecha equivocada, un modo que merezca construirse o una idea sobre el juego: escribe a {email}, se lee.",

  supportTitle: "Invítame a un café",
  supportLead:
    "Tempus es gratis, no lleva publicidad y se escribe en tardes libres.",
  supportSoon:
    "Todavía no hay bote que pasar. Cuando exista una forma de hacerlo, estará aquí.",

  dailyDone: "Diario completado",
  dailyAlreadyToday: "Ya has jugado hoy.",
  dailyPointsLabel: "Puntos",
  dailyPointsOf: "{n} de {max}",
  dailyTriple: "Puntos triples",
  dailyGuestNotice:
    "Juegas como invitado, así que no se guarda nada. Inicia sesión y cada diario cuenta el triple.",
  dailyGuestScore: "No registrado",
  dailyNextIn: "Nuevas preguntas en {h} h {m} min",
  dailyNextInSoon: "Nuevas preguntas en {m} min",
  dailySubmitFailed: "No se pudo enviar. Inténtalo de nuevo.",

  noEvents: "No hay eventos disponibles. Revisa la conexión a la base de datos.",

  notFoundCode: "404",
  notFoundTitle: "Esta página no está aquí.",
  notFoundBlurb:
    "Puede que el enlace sea antiguo o que la dirección tenga una errata. Todo lo jugable está en la página de inicio.",
  notFoundHome: "Volver al tablero",
  notFoundPlay: "Jugar una ronda",
};

export const DICTIONARIES: Record<SupportedLocale, Dict> = { en, tr, de, fr, es };

export function dictionary(locale: SupportedLocale): Dict {
  return DICTIONARIES[locale];
}

/**
 * The locale half of a rendered date, for lib/historical-date.ts.
 *
 * That module prints dates and is also run by `scripts/` under plain node, so
 * it takes its labels rather than importing a dictionary. This is the one
 * place the two meet: pass the result to `formatYear` or
 * `formatHistoricalDate` and the era reads "MÖ" in Turkish instead of "BCE".
 *
 * `bce`/`commonEra` rather than new keys, because an era is named once on this
 * site — the date entry's own chip reads the same two strings.
 */
export function dateLabels(t: Dict): DateLabels {
  return {
    bce: t.bce,
    ce: t.commonEra,
    pattern: t.yearWithEra,
    decade: t.decadeLabel,
    century: t.centuryLabel,
    millennium: t.millenniumLabel,
    million: t.millionLabel,
    billion: t.billionLabel,
  };
}

/** Fills `{n}`-style placeholders. Keeps the dictionaries plain data. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
