import { Link } from 'react-router-dom'
import { LogoMark } from '../components/icons'

const CONTACT_EMAIL = 'sean.outhwaite@gmail.com'

// Public (no sign-in needed): Google's OAuth consent screen links here.
export function Privacy() {
  return (
    <main className="legal-page">
      <Link to="/" className="legal-home">
        <LogoMark />
        Backlog
      </Link>

      <h1>Privacy policy</h1>
      <p className="legal-updated">Last updated 9 October 2026</p>

      <p>
        Backlog is a small personal project for tracking what you want to watch, read, and play, and sharing it with
        friends. This page explains what it stores about you and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your email address, used to sign you in.</li>
        <li>The username you choose.</li>
        <li>Your lists: the titles you add, their status, order, and series progress.</li>
        <li>
          Your friends (people who used your invite link, or whose link you used) and the recommendations you send and
          receive.
        </li>
      </ul>

      <h2>Signing in with Google</h2>
      <p>
        If you sign in with Google, Google shares your name, email address, and profile picture with us. Our sign-in
        provider keeps a copy of these alongside your account, but Backlog only uses your email address. Your name and
        picture aren&apos;t shown anywhere in the app or shared with anyone.
      </p>

      <h2>Who can see your data</h2>
      <p>
        Your friends on Backlog can see your username, your lists, and recommendations you send them. Nobody else can.
        We don&apos;t sell or share your data, and there are no ads or analytics.
      </p>

      <h2>Services we use</h2>
      <ul>
        <li>
          <strong>Supabase</strong> handles sign-in and hosts the database.
        </li>
        <li>
          <strong>Vercel</strong> hosts the app.
        </li>
        <li>
          <strong>Google</strong> provides Google sign-in and the fonts the app uses.
        </li>
        <li>
          <strong>TMDB, Open Library, and RAWG</strong> supply movie, TV, book, and game details. Searches are sent to
          them from our server, without anything that identifies you.
        </li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <p>
        Backlog keeps your sign-in session in your browser&apos;s local storage, and briefly remembers an invite link
        while you sign in. It doesn&apos;t use tracking cookies.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we&apos;ll delete your account and everything
        associated with it. The same address works for any other privacy questions.
      </p>
    </main>
  )
}
