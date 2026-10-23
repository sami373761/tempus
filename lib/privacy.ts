import type { SupportedLocale } from "./db/types.ts";

/**
 * The privacy policy, in each of the site's five languages.
 *
 * Kept out of the dictionary because it is a document rather than interface
 * copy: a few dozen paragraphs that are only ever read on `/privacy`, and that
 * would otherwise be loaded into every page's dictionary. Typed as a record
 * over `SupportedLocale`, so a missing language is a compile error just as a
 * missing dictionary key is.
 *
 * **It describes what the code actually does — keep the two in step.** Each
 * section names something real: the cookies (`tempus_locale`,
 * `tempus_plays`, `tempus_recovery` and Supabase's session), the processors
 * (Supabase, Cloudflare R2, the Oracle VM, Resend, Google sign-in) and what is
 * public (the leaderboard). A new cookie, tracker or provider means a new
 * sentence here and a new `PRIVACY_UPDATED`.
 *
 * `{email}` in a paragraph is replaced with `CONTACT_EMAIL` as a link.
 */

/** ISO date of the last change to the policy's substance. */
export const PRIVACY_UPDATED = "2026-10-23";

export interface PrivacySection {
  title: string;
  paragraphs: string[];
}

export interface PrivacyDoc {
  title: string;
  lead: string;
  updatedLabel: string;
  sections: PrivacySection[];
}

export const PRIVACY: Record<SupportedLocale, PrivacyDoc> = {
  en: {
    title: "Privacy policy",
    lead: "Tempus is a history game. We collect only what it takes to run your account and your games, we don't sell anything, and there are no ads or tracking scripts.",
    updatedLabel: "Last updated",
    sections: [
      {
        title: "What we collect",
        paragraphs: [
          "Account: your email address, the username you choose, and your password — stored only as a secure hash by our authentication provider. If you sign in with Google, we receive your email address and basic profile from Google; we never see your Google password.",
          "Profile photo: only if you upload one.",
          "Games: your guesses, scores, points (TP), Chrono Rating (KP), badges and head-to-head match results, so your progress and the leaderboard work.",
          "Without an account you can play without giving us anything; we only keep a small cookie that counts today's games.",
        ],
      },
      {
        title: "How we use it",
        paragraphs: [
          "To run your account, save your progress, rank the leaderboard, pair you with opponents, and send account emails such as password resets. We don't send marketing emails, and we don't sell or rent your data to anyone.",
        ],
      },
      {
        title: "What others can see",
        paragraphs: [
          "Your username, profile photo, worn badge and scores appear on the leaderboard and to opponents in head-to-head games. Your email address is never shown to other players.",
        ],
      },
      {
        title: "Cookies and local storage",
        paragraphs: [
          "We use only cookies the site needs to work: a sign-in session cookie, a cookie that remembers your language (tempus_locale), one that counts guests' daily games (tempus_plays), and a short-lived one used during a password reset (tempus_recovery). Head-to-head games keep your seat in your browser's session storage. There are no advertising or analytics cookies.",
        ],
      },
      {
        title: "Services we use",
        paragraphs: [
          "Supabase (database and sign-in), Cloudflare (images and domain), Oracle Cloud (the web server), Resend (account emails) and Google (only if you choose to sign in with Google). They process data on our behalf to run the site, and some of them are outside your country.",
        ],
      },
      {
        title: "How long we keep it",
        paragraphs: [
          "As long as your account exists. When an account is deleted, its profile, photo and game history are deleted with it. Server logs may briefly hold technical data such as IP addresses for security.",
        ],
      },
      {
        title: "Your rights",
        paragraphs: [
          "You can see and change your username, photo and password on your account page. To get a copy of your data or have your account deleted, write to {email} from your account's address and we'll handle it.",
        ],
      },
      {
        title: "Children",
        paragraphs: [
          "Tempus is not meant for children under 13, and we don't knowingly collect their data. If you think a child has made an account, write to us and we'll delete it.",
        ],
      },
      {
        title: "Changes and contact",
        paragraphs: [
          "If this policy changes, the date at the top changes with it. Questions are welcome at {email}.",
        ],
      },
    ],
  },

  tr: {
    title: "Gizlilik politikası",
    lead: "Tempus bir tarih oyunu. Yalnızca hesabını ve oyunlarını çalıştırmak için gerekeni topluyoruz; hiçbir şey satmıyoruz, reklam ya da takip kodu yok.",
    updatedLabel: "Son güncelleme",
    sections: [
      {
        title: "Neleri topluyoruz",
        paragraphs: [
          "Hesap: e-posta adresin, seçtiğin kullanıcı adı ve şifren — şifren kimlik doğrulama sağlayıcımızda yalnızca güvenli bir özet (hash) olarak saklanır. Google ile giriş yaparsan Google'dan e-posta adresini ve temel profil bilgini alırız; Google şifreni asla görmeyiz.",
          "Profil fotoğrafı: yalnızca yüklersen.",
          "Oyunlar: tahminlerin, skorların, puanların (TP), Chrono Rating'in (KP), rozetlerin ve karşılıklı maç sonuçların — ilerlemen ve liderlik tablosu çalışsın diye.",
          "Hesapsız oynarken bize hiçbir bilgi vermezsin; yalnızca o günkü oyunlarını sayan küçük bir çerez tutarız.",
        ],
      },
      {
        title: "Nasıl kullanıyoruz",
        paragraphs: [
          "Hesabını çalıştırmak, ilerlemeni kaydetmek, liderlik tablosunu sıralamak, seni rakiplerle eşleştirmek ve şifre sıfırlama gibi hesap e-postaları göndermek için. Pazarlama e-postası göndermeyiz; verilerini kimseye satmaz ya da kiralamayız.",
        ],
      },
      {
        title: "Başkaları neyi görebilir",
        paragraphs: [
          "Kullanıcı adın, profil fotoğrafın, taktığın rozet ve skorların liderlik tablosunda ve karşılıklı oyunlarda rakiplerine görünür. E-posta adresin diğer oyunculara asla gösterilmez.",
        ],
      },
      {
        title: "Çerezler ve yerel depolama",
        paragraphs: [
          "Yalnızca sitenin çalışması için gereken çerezleri kullanırız: oturum çerezi, dil tercihini hatırlayan çerez (tempus_locale), misafirlerin günlük oyunlarını sayan çerez (tempus_plays) ve şifre sıfırlama sırasında kısa süreliğine kullanılan çerez (tempus_recovery). Karşılıklı oyunlar koltuğunu tarayıcının oturum depolamasında tutar. Reklam ya da analiz çerezi yoktur.",
        ],
      },
      {
        title: "Kullandığımız hizmetler",
        paragraphs: [
          "Supabase (veritabanı ve giriş), Cloudflare (görseller ve alan adı), Oracle Cloud (web sunucusu), Resend (hesap e-postaları) ve Google (yalnızca Google ile girişi seçersen). Bu hizmetler siteyi çalıştırmak için verileri bizim adımıza işler; bazıları senin ülkenin dışındadır.",
        ],
      },
      {
        title: "Ne kadar saklıyoruz",
        paragraphs: [
          "Hesabın var olduğu sürece. Bir hesap silindiğinde profili, fotoğrafı ve oyun geçmişi de onunla birlikte silinir. Sunucu kayıtları güvenlik için IP adresi gibi teknik verileri kısa süre tutabilir.",
        ],
      },
      {
        title: "Hakların",
        paragraphs: [
          "Kullanıcı adını, fotoğrafını ve şifreni hesap sayfandan görüp değiştirebilirsin. Verilerinin bir kopyasını istemek ya da hesabını sildirmek için hesabının adresinden {email} adresine yaz, ilgileniriz.",
        ],
      },
      {
        title: "Çocuklar",
        paragraphs: [
          "Tempus 13 yaşından küçük çocuklar için tasarlanmadı ve onların verilerini bilerek toplamayız. Bir çocuğun hesap açtığını düşünüyorsan bize yaz, sileriz.",
        ],
      },
      {
        title: "Değişiklikler ve iletişim",
        paragraphs: [
          "Bu politika değişirse en üstteki tarih de değişir. Soruların için {email} adresine yazabilirsin.",
        ],
      },
    ],
  },

  de: {
    title: "Datenschutzerklärung",
    lead: "Tempus ist ein Geschichtsspiel. Wir erheben nur, was für dein Konto und deine Spiele nötig ist, verkaufen nichts und verwenden weder Werbung noch Tracking-Skripte.",
    updatedLabel: "Zuletzt aktualisiert",
    sections: [
      {
        title: "Was wir erheben",
        paragraphs: [
          "Konto: deine E-Mail-Adresse, der Benutzername, den du wählst, und dein Passwort — bei unserem Anmeldedienst nur als sicherer Hash gespeichert. Wenn du dich mit Google anmeldest, erhalten wir von Google deine E-Mail-Adresse und dein Basisprofil; dein Google-Passwort sehen wir nie.",
          "Profilbild: nur, wenn du eines hochlädst.",
          "Spiele: deine Tipps, Ergebnisse, Punkte (TP), Chrono Rating (KP), Abzeichen und Ergebnisse von Duellen, damit dein Fortschritt und die Bestenliste funktionieren.",
          "Ohne Konto kannst du spielen, ohne uns etwas zu geben; wir speichern nur ein kleines Cookie, das die heutigen Spiele zählt.",
        ],
      },
      {
        title: "Wofür wir sie nutzen",
        paragraphs: [
          "Um dein Konto zu betreiben, deinen Fortschritt zu speichern, die Bestenliste zu ordnen, dir Gegner zuzuteilen und Konto-E-Mails wie das Zurücksetzen des Passworts zu senden. Wir verschicken keine Werbe-E-Mails und verkaufen oder vermieten deine Daten an niemanden.",
        ],
      },
      {
        title: "Was andere sehen",
        paragraphs: [
          "Dein Benutzername, dein Profilbild, dein getragenes Abzeichen und deine Ergebnisse erscheinen in der Bestenliste und bei Gegnern im Duell. Deine E-Mail-Adresse wird anderen Spielern nie angezeigt.",
        ],
      },
      {
        title: "Cookies und lokaler Speicher",
        paragraphs: [
          "Wir verwenden nur Cookies, die die Seite zum Funktionieren braucht: ein Anmelde-Sitzungscookie, ein Cookie für deine Sprache (tempus_locale), eines, das die täglichen Spiele von Gästen zählt (tempus_plays), und ein kurzlebiges beim Zurücksetzen des Passworts (tempus_recovery). Duelle speichern deinen Platz im Sitzungsspeicher deines Browsers. Es gibt keine Werbe- oder Analyse-Cookies.",
        ],
      },
      {
        title: "Dienste, die wir nutzen",
        paragraphs: [
          "Supabase (Datenbank und Anmeldung), Cloudflare (Bilder und Domain), Oracle Cloud (Webserver), Resend (Konto-E-Mails) und Google (nur, wenn du dich mit Google anmeldest). Sie verarbeiten Daten in unserem Auftrag, um die Seite zu betreiben; einige davon befinden sich außerhalb deines Landes.",
        ],
      },
      {
        title: "Wie lange wir sie speichern",
        paragraphs: [
          "Solange dein Konto besteht. Wird ein Konto gelöscht, werden Profil, Bild und Spielverlauf mitgelöscht. Server-Protokolle können technische Daten wie IP-Adressen aus Sicherheitsgründen kurz speichern.",
        ],
      },
      {
        title: "Deine Rechte",
        paragraphs: [
          "Benutzername, Bild und Passwort kannst du auf deiner Kontoseite einsehen und ändern. Für eine Kopie deiner Daten oder die Löschung deines Kontos schreib von der Adresse deines Kontos an {email}, und wir kümmern uns darum.",
        ],
      },
      {
        title: "Kinder",
        paragraphs: [
          "Tempus ist nicht für Kinder unter 13 Jahren gedacht, und wir erheben wissentlich keine Daten von ihnen. Wenn du glaubst, dass ein Kind ein Konto angelegt hat, schreib uns, und wir löschen es.",
        ],
      },
      {
        title: "Änderungen und Kontakt",
        paragraphs: [
          "Ändert sich diese Erklärung, ändert sich auch das Datum oben. Fragen gern an {email}.",
        ],
      },
    ],
  },

  fr: {
    title: "Politique de confidentialité",
    lead: "Tempus est un jeu d'histoire. Nous ne collectons que ce qu'il faut pour faire fonctionner votre compte et vos parties, nous ne vendons rien, et il n'y a ni publicité ni script de suivi.",
    updatedLabel: "Dernière mise à jour",
    sections: [
      {
        title: "Ce que nous collectons",
        paragraphs: [
          "Compte : votre adresse e-mail, le nom d'utilisateur que vous choisissez et votre mot de passe — conservé uniquement sous forme de hachage sécurisé par notre fournisseur d'authentification. Si vous vous connectez avec Google, nous recevons de Google votre adresse e-mail et votre profil de base ; nous ne voyons jamais votre mot de passe Google.",
          "Photo de profil : seulement si vous en ajoutez une.",
          "Parties : vos réponses, scores, points (TP), Chrono Rating (KP), badges et résultats de duels, pour que votre progression et le classement fonctionnent.",
          "Sans compte, vous pouvez jouer sans rien nous donner ; nous gardons seulement un petit cookie qui compte les parties du jour.",
        ],
      },
      {
        title: "Comment nous les utilisons",
        paragraphs: [
          "Pour faire fonctionner votre compte, enregistrer votre progression, établir le classement, vous trouver des adversaires et envoyer les e-mails de compte, comme la réinitialisation du mot de passe. Nous n'envoyons pas d'e-mails marketing et ne vendons ni ne louons vos données à qui que ce soit.",
        ],
      },
      {
        title: "Ce que les autres voient",
        paragraphs: [
          "Votre nom d'utilisateur, votre photo, le badge que vous portez et vos scores apparaissent dans le classement et auprès de vos adversaires en duel. Votre adresse e-mail n'est jamais montrée aux autres joueurs.",
        ],
      },
      {
        title: "Cookies et stockage local",
        paragraphs: [
          "Nous utilisons uniquement les cookies nécessaires au fonctionnement du site : un cookie de session de connexion, un cookie qui retient votre langue (tempus_locale), un qui compte les parties quotidiennes des invités (tempus_plays) et un cookie de courte durée utilisé lors d'une réinitialisation de mot de passe (tempus_recovery). Les duels gardent votre place dans le stockage de session du navigateur. Il n'y a aucun cookie publicitaire ou de mesure d'audience.",
        ],
      },
      {
        title: "Services utilisés",
        paragraphs: [
          "Supabase (base de données et connexion), Cloudflare (images et domaine), Oracle Cloud (serveur web), Resend (e-mails de compte) et Google (uniquement si vous choisissez de vous connecter avec Google). Ils traitent des données pour notre compte afin de faire fonctionner le site ; certains se trouvent hors de votre pays.",
        ],
      },
      {
        title: "Durée de conservation",
        paragraphs: [
          "Tant que votre compte existe. Quand un compte est supprimé, son profil, sa photo et son historique de jeu le sont aussi. Les journaux du serveur peuvent conserver brièvement des données techniques comme l'adresse IP, pour la sécurité.",
        ],
      },
      {
        title: "Vos droits",
        paragraphs: [
          "Vous pouvez consulter et modifier votre nom d'utilisateur, votre photo et votre mot de passe sur votre page de compte. Pour obtenir une copie de vos données ou faire supprimer votre compte, écrivez à {email} depuis l'adresse de votre compte et nous nous en occuperons.",
        ],
      },
      {
        title: "Enfants",
        paragraphs: [
          "Tempus ne s'adresse pas aux enfants de moins de 13 ans, et nous ne collectons pas sciemment leurs données. Si vous pensez qu'un enfant a créé un compte, écrivez-nous et nous le supprimerons.",
        ],
      },
      {
        title: "Modifications et contact",
        paragraphs: [
          "Si cette politique change, la date en haut change aussi. Vos questions sont les bienvenues à {email}.",
        ],
      },
    ],
  },

  es: {
    title: "Política de privacidad",
    lead: "Tempus es un juego de historia. Solo recogemos lo necesario para que funcionen tu cuenta y tus partidas, no vendemos nada y no hay anuncios ni scripts de seguimiento.",
    updatedLabel: "Última actualización",
    sections: [
      {
        title: "Qué recogemos",
        paragraphs: [
          "Cuenta: tu correo electrónico, el nombre de usuario que elijas y tu contraseña, que nuestro proveedor de autenticación guarda solo como un hash seguro. Si inicias sesión con Google, recibimos de Google tu correo y tu perfil básico; nunca vemos tu contraseña de Google.",
          "Foto de perfil: solo si subes una.",
          "Partidas: tus respuestas, puntuaciones, puntos (TP), Chrono Rating (KP), insignias y resultados de duelos, para que funcionen tu progreso y la clasificación.",
          "Sin cuenta puedes jugar sin darnos nada; solo guardamos una pequeña cookie que cuenta las partidas del día.",
        ],
      },
      {
        title: "Cómo los usamos",
        paragraphs: [
          "Para gestionar tu cuenta, guardar tu progreso, ordenar la clasificación, emparejarte con rivales y enviar correos de la cuenta, como el restablecimiento de contraseña. No enviamos correos publicitarios ni vendemos o alquilamos tus datos a nadie.",
        ],
      },
      {
        title: "Qué ven los demás",
        paragraphs: [
          "Tu nombre de usuario, tu foto, la insignia que llevas y tus puntuaciones aparecen en la clasificación y ante tus rivales en los duelos. Tu correo nunca se muestra a otros jugadores.",
        ],
      },
      {
        title: "Cookies y almacenamiento local",
        paragraphs: [
          "Solo usamos las cookies que el sitio necesita para funcionar: una cookie de sesión, una que recuerda tu idioma (tempus_locale), otra que cuenta las partidas diarias de los invitados (tempus_plays) y una de corta duración durante el restablecimiento de contraseña (tempus_recovery). Los duelos guardan tu asiento en el almacenamiento de sesión del navegador. No hay cookies de publicidad ni de analítica.",
        ],
      },
      {
        title: "Servicios que usamos",
        paragraphs: [
          "Supabase (base de datos e inicio de sesión), Cloudflare (imágenes y dominio), Oracle Cloud (servidor web), Resend (correos de la cuenta) y Google (solo si eliges iniciar sesión con Google). Tratan datos en nuestro nombre para que el sitio funcione; algunos están fuera de tu país.",
        ],
      },
      {
        title: "Cuánto tiempo los guardamos",
        paragraphs: [
          "Mientras exista tu cuenta. Cuando se elimina una cuenta, también se eliminan su perfil, su foto y su historial de juego. Los registros del servidor pueden guardar brevemente datos técnicos como la dirección IP por seguridad.",
        ],
      },
      {
        title: "Tus derechos",
        paragraphs: [
          "Puedes ver y cambiar tu nombre de usuario, tu foto y tu contraseña en la página de tu cuenta. Para pedir una copia de tus datos o eliminar tu cuenta, escribe a {email} desde la dirección de tu cuenta y nos encargamos.",
        ],
      },
      {
        title: "Menores",
        paragraphs: [
          "Tempus no está pensado para menores de 13 años y no recogemos sus datos a sabiendas. Si crees que un menor ha creado una cuenta, escríbenos y la eliminaremos.",
        ],
      },
      {
        title: "Cambios y contacto",
        paragraphs: [
          "Si esta política cambia, también cambia la fecha de arriba. Puedes escribirnos con tus preguntas a {email}.",
        ],
      },
    ],
  },
};
