import type { Metadata } from "next";
import { Contact, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy · Trove" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 20, 2026">
      <p>
        Trove is a place to keep the books, podcasts, films, shows and places you love, and to find what&rsquo;s next
        through your friends. This page says what we keep about you, why, who else handles it, and how to remove it.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <strong>Your phone number or email</strong>, to send your sign-in codes and to know it&rsquo;s you.
        </li>
        <li>
          <strong>Your profile</strong>: your name, an optional photo, and your link name, if you choose them.
        </li>
        <li>
          <strong>What you save</strong>: titles, places, your notes, tags, who recommended something, and what you mark
          private.
        </li>
        <li>
          <strong>Your friends and messages</strong>: who you&rsquo;re friends with, invites, and messages you send them.
        </li>
        <li>
          <strong>How Trove is used</strong>: simple events such as signing in, opening a friend&rsquo;s trove or sending
          an invite, so we can see whether Trove is working. We use no outside analytics or advertising trackers.
        </li>
        <li>
          <strong>Photos you choose to read</strong> (a book cover, a screenshot) are sent to be read and are not kept.
        </li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li>Your friends on Trove see what you save, except anything you mark private, and never who recommended it to you.</li>
        <li>Anyone with a link you share sees what that link covers.</li>
        <li>We don&rsquo;t sell your information, and we don&rsquo;t use it for advertising.</li>
      </ul>

      <h2>Text messages</h2>
      <p>
        If you sign in with your phone number, we text you a one-time code each time you ask for one, and nothing else.
        <strong>
          {" "}
          We don&rsquo;t share your phone number or your consent to receive texts with anyone for marketing or
          promotional purposes.
        </strong>{" "}
        Your number is shared only with the text-message provider that delivers the code.
      </p>

      <h2>Services that handle it for us</h2>
      <ul>
        <li>Vercel hosts Trove; Turso stores its database.</li>
        <li>Twilio delivers sign-in texts; Resend delivers sign-in emails.</li>
        <li>Anthropic (Claude) reads photos you choose and suggests ideas from what you&rsquo;ve saved.</li>
        <li>
          Searches you type go to catalogs and maps to find matches: Open Library, Google Books, Apple Podcasts, TMDB,
          TVmaze, OpenStreetMap and Google Maps. They get the search, not who you are.
        </li>
      </ul>
      <p>Each handles your information only to provide its service to Trove.</p>

      <h2>Removing it</h2>
      <p>
        You can delete anything you&rsquo;ve saved at any time. To delete everything, open your account in the app and
        tap <strong>Delete account</strong>: your account, what you saved, your photo and your messages are removed.
      </p>

      <h2>Children</h2>
      <p>Trove isn&rsquo;t meant for children under 13, and we don&rsquo;t knowingly keep their information.</p>

      <h2>Changes and questions</h2>
      <p>
        If this policy changes, we&rsquo;ll update this page and the date above. For questions or requests, <Contact />.
      </p>
    </LegalPage>
  );
}
