import React from 'react';
import Head from 'next/head';
import { Shield, Zap, Video, Users, Sparkles, MessageSquare } from 'lucide-react';

export default function Home() {
  return (
    <div style={styles.container}>
      <Head>
        <title>JAMSH - Meet the world in a blink</title>
        <meta name="description" content="Secure, lightning-fast social networking with E2E encryption and real-time random matchmaking." />
        <link rel="icon" href="/logo.png" />
      </Head>

      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <img src="/logo.png" alt="JAMSH Logo" style={styles.logoImg} />
          <h1 style={styles.logoText}>JAMSH</h1>
        </div>
        <nav style={styles.nav}>
          <a href="#features" style={styles.navLink}>Features</a>
          <a href="#security" style={styles.navLink}>E2EE Verification</a>
          <button style={styles.loginBtn} onClick={() => alert('Redirecting to auth flow... Try logging in on the local mobile or web clients!')}>Log In</button>
        </nav>
      </header>

      {/* HERO SECTION */}
      <main style={styles.hero}>
        <div style={styles.thunderOverlay} />
        <h2 style={styles.heroTagline}>Meet the world in a blink.</h2>
        <p style={styles.heroSub}>
          Connect with strangers instantly via Voice Match, E2E encrypted chat, and live video broadcast channels. Built with electric speed.
        </p>

        <div style={styles.ctaRow}>
          <button style={styles.ctaPrimary} onClick={() => alert('Random match matchmaking initialized. Launching client...')}>
            <Zap size={20} color="#000" /> Start Random Match
          </button>
          <button style={styles.ctaSecondary} onClick={() => alert('Launching voice matchmaking...')}>
            <Users size={20} color="#FFD700" /> Voice Match
          </button>
        </div>
      </main>

      {/* CORE FEATURES GRID */}
      <section id="features" style={styles.features}>
        <h3 style={styles.sectionTitle}>Exclusive Features</h3>
        <div style={styles.grid}>
          <div style={styles.card}>
            <Zap size={32} color="#F59A18" />
            <h4 style={styles.cardTitle}>Thunder Reactions</h4>
            <p style={styles.cardText}>Hearts are gone. React with animated electric thunderbolts and view counts in real-time.</p>
          </div>
          <div style={styles.card}>
            <MessageSquare size={32} color="#F59A18" />
            <h4 style={styles.cardTitle}>E2E Encrypted Chat</h4>
            <p style={styles.cardText}>Your privacy is absolute. Key agreement exchanges occur locally on your device.</p>
          </div>
          <div style={styles.card}>
            <Video size={32} color="#F59A18" />
            <h4 style={styles.cardTitle}>Creator Universe</h4>
            <p style={styles.cardText}>Monetize channels and share exclusive vlogs/shorts with your community.</p>
          </div>
          <div style={styles.card}>
            <Sparkles size={32} color="#F59A18" />
            <h4 style={styles.cardTitle}>Random Match</h4>
            <p style={styles.cardText}>Filter by gender, language, and interests, and connect with people globally instantly.</p>
          </div>
        </div>
      </section>

      {/* SECURITY VERIFICATION BANNER */}
      <section id="security" style={styles.security}>
        <div style={styles.securityBox}>
          <Shield size={48} color="#FFD700" />
          <h3 style={{ margin: '16px 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>End-to-End Encrypted Protocols</h3>
          <p style={{ maxWidth: '600px', margin: '0 auto', fontSize: '15px', color: '#A8A8A8', lineHeight: '22px' }}>
            JAMSH implements X25519 DH pairwise key agreements and local AES-256-GCM authenticated encryption. Neither the database server nor third-party routers can decrypt your conversations.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <p>© 2026 JAMSH INC. MEET THE WORLD IN A BLINK. ⚡</p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#000000',
    color: '#F5F5F5',
    minHeight: '100vh',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 80px',
    borderBottom: '1px solid #262626',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoImg: {
    width: '36px',
    height: '36px',
    objectFit: 'contain',
    filter: 'drop-shadow(0px 0px 4px #F59A18)',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: '900',
    letterSpacing: '1.5px',
    background: 'linear-gradient(45deg, #F59A18 0%, #FFD700 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  navLink: {
    color: '#A8A8A8',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '500',
    transition: 'color 0.2s',
  },
  loginBtn: {
    backgroundColor: 'transparent',
    color: '#FFD700',
    border: '1px solid #FFD700',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  hero: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '120px 20px',
    background: 'radial-gradient(circle at center, rgba(245,154,24,0.08) 0%, rgba(0,0,0,0) 70%)',
  },
  thunderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'linear-gradient(rgba(245,154,24,0.01), rgba(0,0,0,0))',
    pointerEvents: 'none',
  },
  heroTagline: {
    fontSize: '56px',
    fontWeight: '900',
    letterSpacing: '-1px',
    marginBottom: '24px',
    background: 'linear-gradient(90deg, #F5F5F5 0%, #FFD700 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  heroSub: {
    fontSize: '18px',
    color: '#A8A8A8',
    maxWidth: '640px',
    lineHeight: '28px',
    marginBottom: '40px',
  },
  ctaRow: {
    display: 'flex',
    gap: '16px',
  },
  ctaPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FFD700',
    color: '#000',
    border: 'none',
    padding: '12px 28px',
    borderRadius: '24px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  ctaSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    color: '#FFD700',
    border: '1px solid rgba(255, 215, 0, 0.3)',
    padding: '12px 28px',
    borderRadius: '24px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  features: {
    padding: '80px',
    borderTop: '1px solid #262626',
    borderBottom: '1px solid #262626',
  },
  sectionTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '48px',
    color: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '32px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '12px',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'transform 0.2s',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#fff',
  },
  cardText: {
    fontSize: '14px',
    color: '#A8A8A8',
    lineHeight: '20px',
  },
  security: {
    padding: '80px 20px',
    textAlign: 'center',
    backgroundColor: '#050505',
  },
  securityBox: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  footer: {
    padding: '32px',
    borderTop: '1px solid #262626',
    textAlign: 'center',
    fontSize: '13px',
    color: '#555',
  },
};
