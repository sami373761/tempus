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
  explorerStatEvents: "events, each with a photograph",
  explorerStatLanguages: "languages, event names included",
  explorerStatSpan: "years of history covered",
  // The span is written per language rather than formatted, because the scale
  // word is what changes: "billion", "Milliarden", "milyar", "millones".
  explorerStatSpanValue: "4.54bn",

  // The FAQ at the foot of the home page, which the menu's FAQ row links to.
  faqTitle: "Frequently asked questions",
  faqBlurb: "What is worth knowing before the first round.",
  faqQ1: "Do I need an account?",
  faqA1:
    "Only for badges. The two games and head-to-head are playable signed out, and a set of ten lives in the tab you are playing it in — but a badge belongs to somebody, so the badges page asks you to sign in.",
  faqQ2: "How are guesses scored?",
  faqA2:
    "By how far off you are relative to the event's own age, not by the raw number of years. Every round lands on one of five verdicts — perfect, great, good, bad or way off — and only the last one is a miss.",
  faqQ3: "How far back does the timeline go?",
  faqA3:
    "To the formation of the Earth, about 4.54 billion years ago. The scale changes as you travel: single years through recorded history, far coarser steps out in deep time.",
  faqQ4: "Can I play against someone else?",
  faqA4:
    "Yes. 1v1 opens a match and gives you a link to send; you both answer the same rounds against the same clock, and neither of you needs an account.",
  faqQ5: "Where do the pictures come from?",
  faqA5:
    "Public-domain photographs and artwork from Wikimedia Commons. An event with no picture simply never comes up.",
  faqQ6: "Which languages does it speak?",
  faqA6:
    "English, Turkish, German, French and Spanish — event names included, not just the buttons. Pick one in the menu at the top of the page.",


  // The set: ten questions, then the summary screen. See lib/game/set.ts.
  setProgress: "{n} of {total}",
  seeResults: "See results",
  setComplete: "Set complete",
  setScore: "{hits} of {total} correct",
  setBestStreak: "Best streak",
  setBreakdown: "How the guesses landed",
  playAgain: "Play again",
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
  // The way in is two cards: the one that works, and the one being built
  // (components/versus-start.tsx). `versusChooseMode` is the step between
  // them — a match is ten questions from *one* pool (`match.mode`), so the
  // game is picked before the code is minted rather than after. The modes
  // name themselves from the board's own titles; only the general library
  // needs a line of its own here.
  versusChooseMode: "Which game?",
  versusModeHistoryBlurb: "Ten dates from the whole of history.",
  versusOnlineTitle: "Online 1v1",
  versusOnlineBlurb:
    "Matched against a stranger, with a ranking to climb. Being built — for now it is a friend and a link.",
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
  newGamesTitle: "New games",
  newGamesBlurb: "More modes on the way",

  // One line per card on the home board, shown under the title while the
  // pointer is on it — see `BoardCard` in components/game-board.tsx. The two
  // built games are deliberately absent: they reuse the instruction their own
  // screen already carries (`timelineBlurb`, `comparisonBlurb`) rather than
  // keeping a second copy of the same sentence in five languages.
  cardDailyBlurb: "One event a day, the same one for everybody.",
  cardDuelBlurb: "Invite a friend and play the same ten rounds against them.",
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

  // The achievements page. Four ranks on one ladder — the best set of ten you
  // have finished — and two standalone feats beside it. Nothing is awarded
  // yet (there are no accounts and no saved scores), so these strings are the
  // rules a badge *will* be given by, and retuning one is an edit here rather
  // than in a component.
  achievementsTitle: "Achievements",
  achievementsNotLive:
    "Nothing is being counted yet. The rules each badge is given out by are settled, but no finished set is measured against them — so every bar here reads zero.",
  achievementsHowTo: "How to earn it",

  badgeBronze: "Bronze",
  badgeBronzeRule: "Finish one set",
  badgeBronzeHow:
    "Play a set of ten questions through to the summary. The score does not matter — this is the badge for having played.",
  badgeSilver: "Silver",
  badgeSilverRule: "6 of 10",
  badgeSilverHow:
    "Land six hits in a single set. A hit is anything the game calls Good or better, so a near miss still counts towards it.",
  badgeGold: "Gold",
  badgeGoldRule: "8 of 10",
  badgeGoldHow:
    "Land eight hits in a single set. At that rate you are reading the photograph for its period rather than guessing a century.",
  badgeDiamond: "Diamond",
  badgeDiamondRule: "10 of 10",
  badgeDiamondHow:
    "Finish a set without a single miss. Ten questions, ten hits, in one sitting.",
  badgeRuby: "Ruby",
  badgeRubyRule: "Win ten duels",
  badgeRubyHow:
    "Win ten head-to-head matches. Only a match played to the end counts, so an opponent who closes their tab does not hand you one.",
  badgeAmethyst: "Amethyst",
  badgeAmethystRule: "A perfect in every era",
  badgeAmethystHow:
    "Score a Perfect on an event from each era the timeline covers — Earth & Cosmos, Humans & Evolution, the Age of Civilization and the Common Era.",


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
  authUsernameHint: "3-20 characters: a-z, 0-9 and underscores.",
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
  authErrUsernameInvalid: "3-20 characters, using a-z, 0-9 and underscores.",
  // Said of a name that is the right *length*: nothing is stripped out of a
  // username any more, so the sentence has to name what was refused.
  authErrUsernameChars:
    "Only a-z, 0-9 and underscores. Accented and non-Latin letters, spaces and punctuation cannot be used.",
  authErrUsernameTaken: "That username is taken.",
  authErrRateLimited: "Too many attempts. Wait a moment and try again.",
  authErrProviderFailed: "Google sign-in is unavailable right now.",
  authErrCurrentPassword: "That is not your current password.",
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
  accountSignOut: "Sign out",
  menuSignOut: "Sign out",

  leaderboardTitle: "Leaderboard",
  leaderboardBlurb: "Where the best sets land.",
  leaderboardPlaceholder:
    "These are sample standings. Nothing is scored yet, so no real set has a place on this board.",
  leaderboardRank: "Rank",
  leaderboardPlayer: "Player",
  leaderboardBest: "Best set",
  leaderboardSets: "Sets",

  // --- the badges page ------------------------------------------------------
  badgesTitle: "Badges",
  badgesIntro:
    "Six rings that go around your profile picture. Four are a rank you climb on your best set of ten; the other two are earned once and stay unrevealed until they are.",
  badgesProgressTo: "Progress to {badge}",
  badgesLocked: "Locked",
  badgesEarned: "Earned",
  badgesUnrevealed: "Unrevealed",
  badgesCount: "{n} of {total} earned",
  /** The card's one control: it hands back the colour the silhouette is
   *  holding. Named per badge because six of these sit on one rail. */
  badgesShowArt: "Show the {badge} badge",
  badgesHideArt: "Hide the {badge} badge",

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
  explorerStatEvents: "olay, her biri fotoğrafıyla",
  explorerStatLanguages: "dil, olay adları dahil",
  explorerStatSpan: "yıllık tarih",
  explorerStatSpanValue: "4,54 milyar",

  faqTitle: "Sıkça sorulan sorular",
  faqBlurb: "İlk turdan önce bilinmeye değer şeyler.",
  faqQ1: "Hesap açmam gerekiyor mu?",
  faqA1:
    "Sadece rozetler için. İki oyun ve 1v1, giriş yapmadan oynanabilir; on soruluk bir seri de oynadığın sekmede yaşar. Ama bir rozet birine ait olduğu için rozetler sayfası giriş yapmanı ister.",
  faqQ2: "Tahminler nasıl puanlanıyor?",
  faqA2:
    "Ham yıl farkına göre değil, olayın kendi yaşına oranla ne kadar şaştığına göre. Her tur beş sonuçtan birine iner — mükemmel, harika, iyi, kötü ya da çok uzak — ve yalnızca sonuncusu ıskadır.",
  faqQ3: "Zaman çizelgesi ne kadar geriye gidiyor?",
  faqA3:
    "Dünya’nın oluşumuna, yaklaşık 4,54 milyar yıl öncesine. Ölçek yol boyunca değişir: yazılı tarihte tek tek yıllar, derin geçmişte çok daha kaba adımlar.",
  faqQ4: "Başkasıyla oynayabilir miyim?",
  faqA4:
    "Evet. 1v1 bir maç açar ve gönderebileceğin bir bağlantı verir; ikiniz aynı turları aynı saate karşı oynarsınız ve kimsenin hesaba ihtiyacı olmaz.",
  faqQ5: "Fotoğraflar nereden geliyor?",
  faqA5:
    "Wikimedia Commons’taki kamu malı fotoğraf ve görsellerden. Fotoğrafı olmayan bir olay oyunda hiç çıkmaz.",
  faqQ6: "Hangi diller var?",
  faqA6:
    "İngilizce, Türkçe, Almanca, Fransızca ve İspanyolca — yalnızca düğmeler değil, olay adları da çevrili. Sayfanın üstündeki menüden seçebilirsin.",


  setProgress: "{total} sorudan {n}.",
  seeResults: "Sonuçları gör",
  setComplete: "Set tamamlandı",
  setScore: "{total} sorudan {hits} doğru",
  setBestStreak: "En uzun seri",
  setBreakdown: "Tahminler nasıl gitti",
  playAgain: "Yeniden oyna",
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
  versusOnlineTitle: "Çevrim içi 1v1",
  versusOnlineBlurb:
    "Rastgele bir rakip ve tırmanılacak bir sıralama. Henüz geliştiriliyor — şimdilik bir arkadaş ve bir bağlantı.",
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
  newGamesTitle: "Yeni oyunlar",
  newGamesBlurb: "Yeni modlar yolda",

  cardDailyBlurb: "Günde bir olay, herkes için aynı olay.",
  cardDuelBlurb: "Bir arkadaşını çağır, aynı on soruyu ona karşı oyna.",
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
  badgeBronzeRule: "Bir seti bitir",
  badgeBronzeHow:
    "On soruluk bir seti özet ekranına kadar oyna. Skorun önemi yok — bu rozet oynamış olmanın rozeti.",
  badgeSilver: "Gümüş",
  badgeSilverRule: "10'da 6",
  badgeSilverHow:
    "Tek bir sette altı isabet tuttur. Oyunun İyi ve üzeri saydığı her tahmin isabettir, yani kıl payı kaçanlar da sayılır.",
  badgeGold: "Altın",
  badgeGoldRule: "10'da 8",
  badgeGoldHow:
    "Tek bir sette sekiz isabet tuttur. Bu orana çıktığında artık yüzyıl tahmin etmiyor, fotoğrafın dönemini okuyorsundur.",
  badgeDiamond: "Elmas",
  badgeDiamondRule: "10'da 10",
  badgeDiamondHow:
    "Bir seti tek bir ıskalama olmadan bitir. On soru, on isabet, tek oturuşta.",
  badgeRuby: "Yakut",
  badgeRubyRule: "On düello kazan",
  badgeRubyHow:
    "On birebir maç kazan. Yalnızca sonuna kadar oynanan maçlar sayılır; sekmesini kapatıp giden bir rakip sana maç kazandırmaz.",
  badgeAmethyst: "Ametist",
  badgeAmethystRule: "Her çağda bir Mükemmel",
  badgeAmethystHow:
    "Zaman çizelgesinin kapsadığı her çağdan bir olayda Mükemmel al — Yerküre & Evren, İnsan & Evrim, Uygarlık Çağı ve Milattan Sonra.",


  authSignInTitle: "Tekrar hoş geldin",
  authSignInBlurb: "Rozetlerini ve tablodaki yerini korumak için giriş yap.",
  authSignUpTitle: "Hesap oluştur",
  authSignUpBlurb: "Bir kullanıcı adı, bir e-posta ve bir şifre. Hepsi bu.",
  authTabSignIn: "Giriş yap",
  authTabSignUp: "Kayıt ol",
  authUsername: "Kullanıcı adı",
  authUsernameHint: "3-20 karakter: a-z, 0-9 ve alt çizgi. Türkçe harf kullanılamaz.",
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
  authErrUsernameInvalid: "3-20 karakter; a-z, 0-9 ve alt çizgi kullan.",
  authErrUsernameChars:
    "Yalnızca a-z, 0-9 ve alt çizgi. Türkçe harfler (ç, ğ, ı, İ, ö, ş, ü), boşluk ve noktalama kullanılamaz.",
  authErrUsernameTaken: "Bu kullanıcı adı alınmış.",
  authErrRateLimited: "Çok fazla deneme. Biraz bekleyip tekrar dene.",
  authErrProviderFailed: "Google ile giriş şu anda kullanılamıyor.",
  authErrCurrentPassword: "Bu, mevcut şifren değil.",
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
  accountSignOut: "Çıkış yap",
  menuSignOut: "Çıkış yap",

  leaderboardTitle: "Liderlik tablosu",
  leaderboardBlurb: "En iyi serilerin yeri.",
  leaderboardPlaceholder:
    "Bunlar örnek sıralamalar. Henüz puan tutulmuyor, yani gerçek bir serinin bu tabloda yeri yok.",
  leaderboardRank: "Sıra",
  leaderboardPlayer: "Oyuncu",
  // "En iyi seri" and "Seri" until 2026-10-10, which in a row of two numbers
  // under uppercased headings read as "EN İYİ SERİ" and "SERİ" — the same word
  // twice, so neither column said which number it held. The second is now the
  // count it actually is.
  leaderboardBest: "En iyi seri",
  // One word, not "Oynanan seri": the column is 5rem and the longer phrase
  // wrapped onto a second line, which left this header a line taller than the
  // three beside it. "Oynanan" next to "En iyi seri" is read as the sets
  // played, which is what the number under it is.
  leaderboardSets: "Oynanan",

  badgesTitle: "Rozetler",
  badgesIntro:
    "Profil fotoğrafının çevresine geçen altı halka. Dördü, bitirdiğin en iyi on soruluk seriyle tırmandığın bir rütbe; diğer ikisi bir kez kazanılır ve kazanılana kadar gizli kalır.",
  badgesProgressTo: "{badge} ilerlemesi",
  badgesLocked: "Kilitli",
  badgesEarned: "Kazanıldı",
  badgesUnrevealed: "Gizli",
  badgesCount: "{total} rozetten {n} tanesi",
  badgesShowArt: "{badge} rozetini göster",
  badgesHideArt: "{badge} rozetini gizle",

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
  explorerStatEvents: "Ereignisse, jedes mit Foto",
  explorerStatLanguages: "Sprachen, Ereignisnamen inklusive",
  explorerStatSpan: "Jahre Geschichte",
  explorerStatSpanValue: "4,54 Mrd.",

  faqTitle: "Häufige Fragen",
  faqBlurb: "Was vor der ersten Runde wissenswert ist.",
  faqQ1: "Brauche ich ein Konto?",
  faqA1:
    "Nur für die Abzeichen. Die beiden Spiele und das Duell lassen sich ohne Anmeldung spielen, und eine Serie aus zehn lebt in dem Tab, in dem du sie spielst. Ein Abzeichen gehört aber jemandem, also verlangt die Abzeichenseite eine Anmeldung.",
  faqQ2: "Wie werden Tipps bewertet?",
  faqA2:
    "Nicht nach dem reinen Jahresabstand, sondern danach, wie weit du im Verhältnis zum Alter des Ereignisses danebenliegst. Jede Runde endet in einem von fünf Urteilen — perfekt, stark, gut, schwach oder weit daneben — und nur das letzte gilt als Fehlschlag.",
  faqQ3: "Wie weit reicht der Zeitstrahl zurück?",
  faqA3:
    "Bis zur Entstehung der Erde vor etwa 4,54 Milliarden Jahren. Der Maßstab ändert sich unterwegs: einzelne Jahre in der überlieferten Geschichte, sehr viel gröbere Schritte in der Tiefenzeit.",
  faqQ4: "Kann ich gegen jemanden spielen?",
  faqA4:
    "Ja. 1v1 öffnet ein Match und gibt dir einen Link zum Verschicken; ihr beantwortet dieselben Runden gegen dieselbe Uhr, und niemand braucht ein Konto.",
  faqQ5: "Woher stammen die Bilder?",
  faqA5:
    "Aus gemeinfreien Fotos und Abbildungen von Wikimedia Commons. Ein Ereignis ohne Bild kommt schlicht nicht vor.",
  faqQ6: "Welche Sprachen gibt es?",
  faqA6:
    "Englisch, Türkisch, Deutsch, Französisch und Spanisch — auch die Ereignisnamen, nicht nur die Beschriftungen. Wähle sie im Menü oben auf der Seite.",


  setProgress: "{n} von {total}",
  seeResults: "Ergebnis ansehen",
  setComplete: "Satz beendet",
  setScore: "{hits} von {total} richtig",
  setBestStreak: "Längste Serie",
  setBreakdown: "Wie die Schätzungen lagen",
  playAgain: "Noch einmal",
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

  versusTitle: "Duell",
  versusBlurb: "Zehn Daten im Wettlauf gegen eine Freundin oder einen Freund.",
  versusPlayFriend: "Gegen Freunde spielen",
  versusChooseMode: "Welches Spiel?",
  versusModeHistoryBlurb: "Zehn Daten aus der ganzen Geschichte.",
  versusOnlineTitle: "Online 1v1",
  versusOnlineBlurb:
    "Gegen zufällige Gegner, mit einer Rangliste. Noch in Arbeit — bis dahin ein Freund und ein Link.",
  versusInviteTitle: "Lade jemanden ein",
  versusInviteBlurb: "Schick den Link oder lass den Code scannen. Das Duell startet, sobald ihr beide bereit seid.",
  versusCopyLink: "Link kopieren",
  versusLinkCopied: "Link kopiert",
  versusShareWhatsApp: "Auf WhatsApp teilen",
  versusInviteMessage: "Spiel gegen mich bei Tempus — zehn Daten im Duell: {url}",
  versusScanHint: "Oder das hier scannen",
  versusMatchCode: "Spielcode",
  versusWaitingForOpponent: "Warte auf deine Gegnerin oder deinen Gegner...",
  versusWaitingToJoin: "Warte darauf, dass jemand beitritt...",
  versusOpponentJoined: "Die Gegenseite ist da.",
  versusReady: "Ich bin bereit",
  versusReadyWaiting: "Warte darauf, dass die Gegenseite bereit ist...",
  versusYouAreReady: "Du bist bereit",
  versusStarting: "Startet...",
  versusYou: "Du",
  versusOpponent: "Gegenseite",
  versusYouLabel: "Du",
  versusThemLabel: "Sie",
  versusTimedOut: "Zeit abgelaufen",
  versusRoundPoints: "{n} Pkt.",
  versusSecondsLeft: "{n}s",
  versusAnswered: "Geantwortet",
  versusThinking: "Rät noch",
  versusNextRoundIn: "Nächste Runde in {n}",
  versusOpponentOffline: "Die Verbindung der Gegenseite ist weg. Die Uhr läuft weiter.",
  versusReconnecting: "Verbinde neu...",
  versusYouWin: "Du gewinnst",
  versusYouLose: "Du verlierst",
  versusDraw: "Unentschieden",
  versusFinalScore: "{you} - {them}",
  versusRoundsWon: "Gewonnene Runden",
  versusRematch: "Nochmal spielen",
  versusRematchAsked: "Warte auf die Zusage...",
  versusRematchOffer: "Die Gegenseite will eine Revanche.",
  versusRematchAccept: "Annehmen",
  versusRematchDecline: "Ablehnen",
  versusRematchDeclined: "Die Revanche wurde abgelehnt.",
  versusBackHome: "Zurück zur Startseite",
  versusShareMatch: "Ergebnis teilen",
  versusMatchNotFound: "Diese Einladung gilt nicht mehr.",
  versusMatchFull: "Dieses Spiel hat schon zwei Mitspielende.",
  versusMatchFinished: "Dieses Spiel ist bereits beendet.",
  versusLeft: "Die Gegenseite hat das Spiel verlassen.",
  versusSeatLost: "Dieser Tab gehört nicht zu diesem Spiel.",
  versusCreateFailed: "Spiel konnte nicht gestartet werden. Versuch es nochmal.",
  versusJoining: "Trete bei...",
  versusStatusReady: "Bereit",
  versusStatusHere: "Da",
  versusStatusAway: "Noch nicht da",

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
  newGamesTitle: "Neue Spiele",
  newGamesBlurb: "Weitere Modi folgen",

  cardDailyBlurb: "Ein Ereignis pro Tag, für alle dasselbe.",
  cardDuelBlurb:
    "Lade jemanden ein und spielt die gleichen zehn Runden gegeneinander.",
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
  badgeBronzeRule: "Einen Satz beenden",
  badgeBronzeHow:
    "Spiele einen Satz aus zehn Fragen bis zur Auswertung durch. Das Ergebnis zählt nicht — dieses Abzeichen gibt es fürs Spielen.",
  badgeSilver: "Silber",
  badgeSilverRule: "6 von 10",
  badgeSilverHow:
    "Lande sechs Treffer in einem einzigen Satz. Als Treffer gilt alles ab Gut, knappe Fehlschätzungen zählen also mit.",
  badgeGold: "Gold",
  badgeGoldRule: "8 von 10",
  badgeGoldHow:
    "Lande acht Treffer in einem einzigen Satz. Bei dieser Quote liest du dem Foto seine Epoche ab, statt ein Jahrhundert zu raten.",
  badgeDiamond: "Diamant",
  badgeDiamondRule: "10 von 10",
  badgeDiamondHow:
    "Beende einen Satz ohne einen einzigen Fehlschuss. Zehn Fragen, zehn Treffer, in einem Durchgang.",
  badgeRuby: "Rubin",
  badgeRubyRule: "Zehn Duelle gewinnen",
  badgeRubyHow:
    "Gewinne zehn Partien im Direktduell. Nur eine zu Ende gespielte Partie zählt — ein Gegner, der seinen Tab schließt, schenkt dir keine.",
  badgeAmethyst: "Amethyst",
  badgeAmethystRule: "Ein Perfekt je Epoche",
  badgeAmethystHow:
    "Hol dir ein Perfekt auf je ein Ereignis aus jeder Epoche der Zeitleiste — Erde & Kosmos, Mensch & Evolution, Zeitalter der Zivilisation und Nach Christus.",


  authSignInTitle: "Willkommen zurück",
  authSignInBlurb: "Melde dich an, um deine Abzeichen und deinen Platz zu behalten.",
  authSignUpTitle: "Konto erstellen",
  authSignUpBlurb: "Ein Benutzername, eine E-Mail und ein Passwort. Mehr nicht.",
  authTabSignIn: "Anmelden",
  authTabSignUp: "Registrieren",
  authUsername: "Benutzername",
  authUsernameHint: "3-20 Zeichen: a-z, 0-9 und Unterstriche. Keine Umlaute.",
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
  authErrUsernameInvalid: "3-20 Zeichen aus a-z, 0-9 und Unterstrichen.",
  authErrUsernameChars:
    "Nur a-z, 0-9 und Unterstriche. Umlaute, ß, Leerzeichen und Satzzeichen sind nicht möglich.",
  authErrUsernameTaken: "Dieser Benutzername ist vergeben.",
  authErrRateLimited: "Zu viele Versuche. Warte kurz und versuche es erneut.",
  authErrProviderFailed: "Die Anmeldung mit Google ist gerade nicht möglich.",
  authErrCurrentPassword: "Das ist nicht dein aktuelles Passwort.",
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
  accountSignOut: "Abmelden",
  menuSignOut: "Abmelden",

  leaderboardTitle: "Rangliste",
  leaderboardBlurb: "Wo die besten Serien landen.",
  leaderboardPlaceholder:
    "Das ist eine Beispielrangliste. Es wird noch nichts gezählt, also hat keine echte Serie hier einen Platz.",
  leaderboardRank: "Platz",
  leaderboardPlayer: "Spieler",
  leaderboardBest: "Beste Serie",
  leaderboardSets: "Serien",

  badgesTitle: "Abzeichen",
  badgesIntro:
    "Sechs Ringe, die um dein Profilbild laufen. Vier sind ein Rang, den du mit deiner besten Serie aus zehn erklimmst; die anderen zwei verdient man einmal und bleiben bis dahin verborgen.",
  badgesProgressTo: "Fortschritt zu {badge}",
  badgesLocked: "Gesperrt",
  badgesEarned: "Verdient",
  badgesUnrevealed: "Verborgen",
  badgesCount: "{n} von {total}",
  badgesShowArt: "Abzeichen {badge} anzeigen",
  badgesHideArt: "Abzeichen {badge} ausblenden",

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
  explorerStatEvents: "événements, tous illustrés",
  explorerStatLanguages: "langues, noms des événements compris",
  explorerStatSpan: "ans d’histoire couverts",
  explorerStatSpanValue: "4,54 Md",

  faqTitle: "Questions fréquentes",
  faqBlurb: "L’essentiel avant la première manche.",
  faqQ1: "Faut-il un compte ?",
  faqA1:
    "Seulement pour les badges. Les deux jeux et le duel se jouent sans compte, et une série de dix vit dans l'onglet où vous la jouez. Mais un badge appartient à quelqu'un : la page des badges demande donc de se connecter.",
  faqQ2: "Comment les réponses sont-elles notées ?",
  faqA2:
    "Par l’écart rapporté à l’âge de l’événement, et non par le nombre d’années brut. Chaque manche aboutit à l’un des cinq verdicts — parfait, excellent, bien, faible ou loin du compte — et seul le dernier compte comme raté.",
  faqQ3: "Jusqu’où remonte la frise ?",
  faqA3:
    "Jusqu’à la formation de la Terre, il y a environ 4,54 milliards d’années. L’échelle change en chemin : l’année près de nous, des pas bien plus larges dans les temps profonds.",
  faqQ4: "Peut-on jouer à deux ?",
  faqA4:
    "Oui. Le mode 1v1 ouvre une partie et vous donne un lien à envoyer ; vous répondez aux mêmes manches sur la même horloge, sans compte.",
  faqQ5: "D’où viennent les images ?",
  faqA5:
    "De photographies et d’illustrations du domaine public, sur Wikimedia Commons. Un événement sans image n’apparaît tout simplement pas.",
  faqQ6: "Quelles langues sont disponibles ?",
  faqA6:
    "Anglais, turc, allemand, français et espagnol — noms des événements compris, pas seulement l’interface. Choisissez dans le menu en haut de la page.",


  setProgress: "{n} sur {total}",
  seeResults: "Voir les résultats",
  setComplete: "Série terminée",
  setScore: "{hits} bonnes réponses sur {total}",
  setBestStreak: "Meilleure série",
  setBreakdown: "Précision des estimations",
  playAgain: "Rejouer",
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
  versusOnlineTitle: "1v1 en ligne",
  versusOnlineBlurb:
    "Contre un adversaire inconnu, avec un classement à gravir. En cours de création — pour l'instant, un ami et un lien.",
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
  newGamesTitle: "Nouveaux jeux",
  newGamesBlurb: "D'autres modes arrivent",

  cardDailyBlurb: "Un événement par jour, le même pour tout le monde.",
  cardDuelBlurb:
    "Invite quelqu'un et jouez les mêmes dix manches l'un contre l'autre.",
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
  badgeBronzeRule: "Terminer une série",
  badgeBronzeHow:
    "Jouez une série de dix questions jusqu'au récapitulatif. Le score n'entre pas en compte — c'est le badge de celui qui a joué.",
  badgeSilver: "Argent",
  badgeSilverRule: "6 sur 10",
  badgeSilverHow:
    "Placez six bonnes réponses dans une même série. Tout ce que le jeu juge Bien ou mieux compte, donc une estimation de peu compte aussi.",
  badgeGold: "Or",
  badgeGoldRule: "8 sur 10",
  badgeGoldHow:
    "Placez huit bonnes réponses dans une même série. À ce rythme, vous lisez l'époque sur la photo au lieu de deviner un siècle.",
  badgeDiamond: "Diamant",
  badgeDiamondRule: "10 sur 10",
  badgeDiamondHow:
    "Terminez une série sans un seul échec. Dix questions, dix réussites, d'une traite.",
  badgeRuby: "Rubis",
  badgeRubyRule: "Gagner dix duels",
  badgeRubyHow:
    "Gagnez dix duels en face-à-face. Seule une partie jouée jusqu'au bout compte : un adversaire qui ferme son onglet ne vous en offre pas une.",
  badgeAmethyst: "Améthyste",
  badgeAmethystRule: "Un Parfait par époque",
  badgeAmethystHow:
    "Obtenez un Parfait sur un événement de chaque époque couverte par la frise — Terre & cosmos, Humains & évolution, Âge des civilisations et Après Jésus-Christ.",


  authSignInTitle: "Content de vous revoir",
  authSignInBlurb: "Connectez-vous pour garder vos badges et votre place au classement.",
  authSignUpTitle: "Créer un compte",
  authSignUpBlurb: "Un nom, une adresse e-mail et un mot de passe. Rien de plus.",
  authTabSignIn: "Se connecter",
  authTabSignUp: "S'inscrire",
  authUsername: "Nom d'utilisateur",
  authUsernameHint: "3 à 20 caractères : a-z, 0-9 et tirets bas. Pas d’accents.",
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
  authErrUsernameInvalid: "3 à 20 caractères : a-z, 0-9 et tirets bas.",
  authErrUsernameChars:
    "Uniquement a-z, 0-9 et tirets bas. Les lettres accentuées, les espaces et la ponctuation sont refusés.",
  authErrUsernameTaken: "Ce nom est déjà pris.",
  authErrRateLimited: "Trop de tentatives. Attendez un moment et réessayez.",
  authErrProviderFailed: "La connexion Google est indisponible pour le moment.",
  authErrCurrentPassword: "Ce n'est pas votre mot de passe actuel.",
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
  accountSignOut: "Se déconnecter",
  menuSignOut: "Se déconnecter",

  leaderboardTitle: "Classement",
  leaderboardBlurb: "Là où atterrissent les meilleures séries.",
  leaderboardPlaceholder:
    "Ce classement est un exemple. Rien n'est encore compté, donc aucune vraie série n'y a sa place.",
  leaderboardRank: "Rang",
  leaderboardPlayer: "Joueur",
  leaderboardBest: "Meilleure série",
  leaderboardSets: "Séries",

  badgesTitle: "Badges",
  badgesIntro:
    "Six anneaux qui entourent votre photo de profil. Quatre forment un rang que l'on gravit avec sa meilleure série de dix ; les deux autres se gagnent une fois et restent cachés jusque-là.",
  badgesProgressTo: "Progression vers {badge}",
  badgesLocked: "Verrouillé",
  badgesEarned: "Obtenu",
  badgesUnrevealed: "Caché",
  badgesCount: "{n} sur {total}",
  badgesShowArt: "Afficher le badge {badge}",
  badgesHideArt: "Masquer le badge {badge}",

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
  explorerStatEvents: "acontecimientos, todos con foto",
  explorerStatLanguages: "idiomas, nombres incluidos",
  explorerStatSpan: "años de historia",
  explorerStatSpanValue: "4540 M",

  faqTitle: "Preguntas frecuentes",
  faqBlurb: "Lo que conviene saber antes de la primera ronda.",
  faqQ1: "¿Hace falta una cuenta?",
  faqA1:
    "Solo para las insignias. Los dos juegos y el duelo se pueden jugar sin cuenta, y una serie de diez vive en la pestaña en la que la juegas. Pero una insignia pertenece a alguien, así que la página de insignias pide iniciar sesión.",
  faqQ2: "¿Cómo se puntúan las respuestas?",
  faqA2:
    "Por lo que te desvías en relación con la edad del acontecimiento, no por los años en bruto. Cada ronda termina en uno de cinco veredictos —perfecto, excelente, bien, flojo o muy lejos— y solo el último cuenta como fallo.",
  faqQ3: "¿Hasta dónde llega la línea de tiempo?",
  faqA3:
    "Hasta la formación de la Tierra, hace unos 4540 millones de años. La escala cambia por el camino: años sueltos en la historia escrita y pasos mucho más amplios en el tiempo profundo.",
  faqQ4: "¿Se puede jugar con otra persona?",
  faqA4:
    "Sí. El modo 1v1 abre una partida y te da un enlace para enviar; ambos respondéis las mismas rondas contra el mismo reloj, sin cuentas.",
  faqQ5: "¿De dónde salen las imágenes?",
  faqA5:
    "De fotografías e ilustraciones de dominio público de Wikimedia Commons. Un acontecimiento sin imagen simplemente no aparece.",
  faqQ6: "¿En qué idiomas está?",
  faqA6:
    "Inglés, turco, alemán, francés y español, incluidos los nombres de los acontecimientos y no solo los botones. Elígelo en el menú de la parte superior de la página.",


  setProgress: "{n} de {total}",
  seeResults: "Ver resultados",
  setComplete: "Serie completada",
  setScore: "{hits} de {total} correctas",
  setBestStreak: "Mejor racha",
  setBreakdown: "Cómo fueron las estimaciones",
  playAgain: "Jugar otra vez",
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
  versusOnlineTitle: "1v1 en línea",
  versusOnlineBlurb:
    "Contra un rival desconocido, con una clasificación que escalar. En construcción — por ahora, un amigo y un enlace.",
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
  newGamesTitle: "Juegos nuevos",
  newGamesBlurb: "Llegan más modos",

  cardDailyBlurb: "Un evento al día, el mismo para todo el mundo.",
  cardDuelBlurb:
    "Invita a alguien y juega las mismas diez rondas contra esa persona.",
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
  badgeBronzeRule: "Terminar una serie",
  badgeBronzeHow:
    "Juega una serie de diez preguntas hasta el resumen. La puntuación da igual: esta es la insignia de haber jugado.",
  badgeSilver: "Plata",
  badgeSilverRule: "6 de 10",
  badgeSilverHow:
    "Acierta seis veces en una misma serie. Cuenta como acierto todo lo que el juego llama Bien o mejor, así que fallar por poco también suma.",
  badgeGold: "Oro",
  badgeGoldRule: "8 de 10",
  badgeGoldHow:
    "Acierta ocho veces en una misma serie. A ese ritmo ya le lees la época a la fotografía en vez de adivinar un siglo.",
  badgeDiamond: "Diamante",
  badgeDiamondRule: "10 de 10",
  badgeDiamondHow:
    "Termina una serie sin un solo fallo. Diez preguntas, diez aciertos, de una sentada.",
  badgeRuby: "Rubí",
  badgeRubyRule: "Ganar diez duelos",
  badgeRubyHow:
    "Gana diez partidas cara a cara. Solo cuenta una partida jugada hasta el final: un rival que cierra su pestaña no te regala ninguna.",
  badgeAmethyst: "Amatista",
  badgeAmethystRule: "Un Perfecto en cada época",
  badgeAmethystHow:
    "Consigue un Perfecto en un evento de cada época que cubre la línea de tiempo: Tierra y cosmos, Humanos y evolución, Edad de la civilización y Después de Cristo.",


  authSignInTitle: "Bienvenido de nuevo",
  authSignInBlurb: "Inicia sesión para conservar tus insignias y tu puesto en la tabla.",
  authSignUpTitle: "Crear una cuenta",
  authSignUpBlurb: "Un nombre, un correo y una contraseña. Nada más.",
  authTabSignIn: "Iniciar sesión",
  authTabSignUp: "Registrarse",
  authUsername: "Nombre de usuario",
  authUsernameHint: "De 3 a 20 caracteres: a-z, 0-9 y guiones bajos. Sin acentos ni ñ.",
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
  authErrUsernameInvalid: "De 3 a 20 caracteres: a-z, 0-9 y guiones bajos.",
  authErrUsernameChars:
    "Solo a-z, 0-9 y guiones bajos. No se admiten acentos, ñ, espacios ni signos de puntuación.",
  authErrUsernameTaken: "Ese nombre ya está ocupado.",
  authErrRateLimited: "Demasiados intentos. Espera un momento y vuelve a probar.",
  authErrProviderFailed: "El inicio de sesión con Google no está disponible ahora.",
  authErrCurrentPassword: "Esa no es tu contraseña actual.",
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
  accountSignOut: "Cerrar sesión",
  menuSignOut: "Cerrar sesión",

  leaderboardTitle: "Clasificación",
  leaderboardBlurb: "Donde aterrizan las mejores series.",
  leaderboardPlaceholder:
    "Esta clasificación es de muestra. Todavía no se puntúa nada, así que ninguna serie real tiene sitio aquí.",
  leaderboardRank: "Puesto",
  leaderboardPlayer: "Jugador",
  leaderboardBest: "Mejor serie",
  leaderboardSets: "Series",

  badgesTitle: "Insignias",
  badgesIntro:
    "Seis anillos que rodean tu foto de perfil. Cuatro son un rango que se sube con tu mejor serie de diez; las otras dos se consiguen una vez y permanecen ocultas hasta entonces.",
  badgesProgressTo: "Avance hacia {badge}",
  badgesLocked: "Bloqueada",
  badgesEarned: "Conseguida",
  badgesUnrevealed: "Oculta",
  badgesCount: "{n} de {total}",
  badgesShowArt: "Mostrar la insignia {badge}",
  badgesHideArt: "Ocultar la insignia {badge}",

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
