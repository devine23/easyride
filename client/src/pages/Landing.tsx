import React from 'react'
import { Link } from 'react-router-dom'
import {
  MapPin, Shield, Zap, Phone, MessageSquare,
  CreditCard, Star, ChevronRight, Car, Building2, User,
} from 'lucide-react'
import EasyGoLogo from '../components/EasyGoLogo'

export default function Landing() {
  return (
    <div className="min-vh-100 overflow-x-hidden">

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <nav
        className="navbar navbar-expand-md fixed-top"
        style={{
          background: 'rgba(10,15,30,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          zIndex: 1050,
        }}
      >
        <div className="container">
          {/* Brand */}
          <Link className="navbar-brand p-0" to="/">
            <Logo />
          </Link>

          {/* Mobile toggler */}
          <button
            className="navbar-toggler border-0"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#landingNav"
            aria-controls="landingNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
            style={{ color: '#9ca3af' }}
          >
            <span className="navbar-toggler-icon" />
          </button>

          {/* Links + CTA */}
          <div className="collapse navbar-collapse" id="landingNav">
            {/* Centre links */}
            <ul className="navbar-nav mx-auto gap-md-2">
              {['Features', 'Portals', 'Payments'].map(l => (
                <li key={l} className="nav-item">
                  <a
                    href={`#${l.toLowerCase()}`}
                    className="nav-link text-secondary"
                    style={{ fontSize: '0.9rem' }}
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>

            {/* Auth buttons — always prominent */}
            <div className="d-flex align-items-center gap-2 mt-2 mt-md-0">
              <Link
                to="/login"
                className="btn btn-secondary px-3 py-2"
                style={{ fontSize: '0.9rem' }}
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="btn btn-primary px-4 py-2"
                style={{ fontSize: '0.9rem' }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section
        className="position-relative overflow-hidden"
        style={{ paddingTop: '7rem', paddingBottom: '5rem' }}
      >
        {/* Glow blob */}
        <div
          className="position-absolute top-0 start-50 translate-middle-x rounded-circle"
          style={{
            width: 600, height: 600,
            background: 'rgba(34,197,94,0.08)',
            filter: 'blur(80px)',
            pointerEvents: 'none',
          }}
        />

        <div className="container position-relative">
          <div className="text-center mx-auto" style={{ maxWidth: 768 }}>
            {/* Badge */}
            <span className="badge-brand d-inline-flex align-items-center gap-2 mb-4 px-3 py-2">
              <Zap size={14} /> Fast · Safe · Reliable
            </span>

            {/* Headline */}
            <h1
              className="fw-bold mb-4"
              style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)', lineHeight: 1.1 }}
            >
              Ride Smarter
              <span
                className="d-block"
                style={{
                  background: 'linear-gradient(to right, #4ade80, #6ee7b7)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                With EasyRide
              </span>
            </h1>

            {/* Sub-copy */}
            <p
              className="text-secondary mb-5 mx-auto"
              style={{ fontSize: '1.1rem', maxWidth: 580 }}
            >
              Zimbabwe's premium ride-hailing platform. Private clients, corporate
              accounts, and professional drivers — all in one seamless ecosystem.
            </p>

            {/* CTA buttons */}
            <div className="d-flex flex-wrap gap-3 justify-content-center">
              <Link
                to="/register?role=private"
                className="btn btn-primary d-inline-flex align-items-center gap-2"
              >
                <User size={18} /> Book a Ride
              </Link>
              <Link
                to="/register?role=corporate"
                className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
              >
                <Building2 size={18} /> Corporate Account
              </Link>
              <Link
                to="/register?role=driver"
                className="btn btn-secondary d-inline-flex align-items-center gap-2"
              >
                <Car size={18} /> Drive with Us
              </Link>
            </div>
          </div>

          {/* Floating feature cards */}
          <div className="row g-4 mt-5 justify-content-center">
            {[
              { icon: MapPin,  label: 'Live Tracking', desc: 'Real-time GPS navigation for all users' },
              { icon: Phone,   label: 'In-App Calls',  desc: 'Connect instantly between client & driver' },
              { icon: Shield,  label: 'Safe & Secure', desc: 'Verified drivers, encrypted payments' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="col-sm-6 col-md-4">
                <div className="card card-glass text-center p-4 animate-fade-in h-100">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-xl mx-auto mb-3"
                    style={{ width: 48, height: 48, background: 'var(--eg-brand-dim)' }}
                  >
                    <Icon size={22} className="text-brand" />
                  </div>
                  <h5 className="fw-semibold mb-1">{label}</h5>
                  <p className="text-secondary small mb-0">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portals ─────────────────────────────────────────────────────────── */}
      <section id="portals" className="py-5">
        <div className="container">
          <SectionHeader tag="Portals" title="One Platform, Three Portals" />
          <div className="row g-4 mt-3">
            <div className="col-md-4">
              <PortalCard
                icon={User} color="blue"
                title="Private Client"
                desc="Book rides instantly with live driver tracking, in-app chat, calls, and flexible payment options."
                features={['Instant booking', 'Live map tracking', 'Chat & voice calls', 'Cash / EcoCash']}
                cta="Sign Up Free" href="/register?role=private"
              />
            </div>
            <div className="col-md-4">
              <PortalCard
                icon={Building2} color="green" featured
                title="Corporate Client"
                desc="Manage company travel with vouchers, employee accounts, department reporting, and bulk billing."
                features={['Voucher payments', 'Employee management', 'Department reports', 'Cost center tracking']}
                cta="Open Corporate Account" href="/register?role=corporate"
              />
            </div>
            <div className="col-md-4">
              <PortalCard
                icon={Car} color="yellow"
                title="Driver"
                desc="Accept rides, navigate routes, communicate with clients, and track your earnings — all in real time."
                features={['Smart ride matching', 'Turn-by-turn navigation', 'Earnings dashboard', 'In-app communication']}
                cta="Start Driving" href="/register?role=driver"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-5" style={{ background: 'rgba(17,24,39,0.5)' }}>
        <div className="container">
          <SectionHeader tag="Features" title="Everything You Need" />
          <div className="row g-4 mt-3">
            {FEATURES.map(f => (
              <div key={f.title} className="col-sm-6 col-lg-4">
                <div className="card p-4 h-100">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-3 mb-3"
                    style={{ width: 44, height: 44, background: f.bgColor }}
                  >
                    <f.icon size={20} style={{ color: f.iconColor }} />
                  </div>
                  <h6 className="fw-semibold mb-2">{f.title}</h6>
                  <p className="text-secondary small mb-0">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Payments ────────────────────────────────────────────────────────── */}
      <section id="payments" className="py-5">
        <div className="container text-center">
          <SectionHeader tag="Payments" title="Multiple Payment Options" />
          <p className="text-secondary mt-2 mb-4">Flexible payment methods for every client type</p>
          <div className="row g-4 justify-content-center">
            {[
              { icon: '💵', name: 'Cash',    desc: 'Pay your driver directly in cash after your ride.',          for: 'All clients'   },
              { icon: '📱', name: 'EcoCash', desc: 'Instant mobile money transfer via EcoCash Zimbabwe.',        for: 'All clients'   },
              { icon: '🎫', name: 'Voucher', desc: 'Pre-authorised corporate vouchers with full paper trail.',   for: 'Corporate only' },
            ].map(p => (
              <div key={p.name} className="col-sm-6 col-md-4">
                <div className="card p-4 text-center h-100">
                  <div className="mb-3" style={{ fontSize: '2.5rem' }}>{p.icon}</div>
                  <h5 className="fw-bold mb-2">{p.name}</h5>
                  <p className="text-secondary small mb-3">{p.desc}</p>
                  <span className="badge-brand">{p.for}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="py-5">
        <div className="container">
          <div
            className="card card-glass p-5 text-center mx-auto"
            style={{ maxWidth: 680 }}
          >
            <div className="d-flex justify-content-center gap-1 mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={20} style={{ fill: '#fbbf24', color: '#fbbf24' }} />
              ))}
            </div>
            <h2 className="fw-bold mb-3">Ready to ride with EasyRide?</h2>
            <p className="text-secondary mb-4">
              Join thousands of satisfied clients and drivers across Zimbabwe.
            </p>
            <Link
              to="/register"
              className="btn btn-primary px-5 py-3 d-inline-flex align-items-center gap-2 mx-auto"
            >
              Get Started Today <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        className="py-4 text-center small"
        style={{
          borderTop: '1px solid var(--eg-600)',
          color: '#6b7280',
        }}
      >
        <Logo size="sm" />
        <p className="mt-3 mb-1">
          Cnr 3rd Kwame Nkrumah, Harare · +263 718 555 666 · +263 716 789 811
        </p>
        <p className="mb-1">dimbiril@cmed.co.zw · chigwayap@cmed.co.zw</p>
        <p className="mt-3 mb-0" style={{ color: '#4b5563' }}>
          © {new Date().getFullYear()} EasyRide Zimbabwe. All rights reserved.
        </p>
      </footer>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <EasyGoLogo height={size === 'sm' ? 36 : 44} />
}

function SectionHeader({ tag, title }: { tag: string; title: string }) {
  return (
    <div className="text-center">
      <span className="badge-brand mb-3 d-inline-flex">{tag}</span>
      <h2 className="fw-bold fs-2">{title}</h2>
    </div>
  )
}

function PortalCard({
  icon: Icon, color, title, desc, features, cta, href, featured,
}: {
  icon: React.ElementType; color: string; title: string; desc: string;
  features: string[]; cta: string; href: string; featured?: boolean;
}) {
  const iconBg: Record<string, string> = {
    blue:   'rgba(59,130,246,0.15)',
    green:  'rgba(34,197,94,0.15)',
    yellow: 'rgba(234,179,8,0.15)',
  }
  const iconColor: Record<string, string> = {
    blue:   '#60a5fa',
    green:  '#4ade80',
    yellow: '#fbbf24',
  }

  return (
    <div
      className="card p-4 h-100 d-flex flex-column position-relative overflow-hidden"
      style={featured ? { borderColor: 'rgba(34,197,94,0.4)' } : {}}
    >
      {/* Featured top accent bar */}
      {featured && (
        <div
          className="position-absolute top-0 start-0 end-0"
          style={{ height: 3, background: 'linear-gradient(to right, #4ade80, #6ee7b7)' }}
        />
      )}

      {/* Icon */}
      <div
        className="d-flex align-items-center justify-content-center rounded-3 mb-3"
        style={{ width: 48, height: 48, background: iconBg[color] }}
      >
        <Icon size={24} style={{ color: iconColor[color] }} />
      </div>

      <h5 className="fw-bold mb-2">{title}</h5>
      <p className="text-secondary small mb-4 flex-grow-1">{desc}</p>

      <ul className="list-unstyled mb-4">
        {features.map(f => (
          <li key={f} className="d-flex align-items-center gap-2 small text-secondary mb-1">
            <span
              className="rounded-circle flex-shrink-0"
              style={{ width: 6, height: 6, background: '#22c55e', display: 'inline-block' }}
            />
            {f}
          </li>
        ))}
      </ul>

      <Link
        to={href}
        className={`btn w-100 ${featured ? 'btn-primary' : 'btn-secondary'}`}
      >
        {cta}
      </Link>
    </div>
  )
}

/* ── Features data ──────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: MapPin,      title: 'Live GPS Tracking',
    desc: 'Real-time location sharing between clients and drivers with route navigation.',
    iconColor: '#4ade80', bgColor: 'rgba(34,197,94,0.15)',
  },
  {
    icon: MessageSquare, title: 'In-App Chat',
    desc: 'Instant messaging between client and driver throughout the ride.',
    iconColor: '#60a5fa', bgColor: 'rgba(59,130,246,0.15)',
  },
  {
    icon: Phone,       title: 'Voice & Video Calls',
    desc: 'Make audio or video calls directly within the app — no number sharing.',
    iconColor: '#c084fc', bgColor: 'rgba(168,85,247,0.15)',
  },
  {
    icon: CreditCard,  title: 'Flexible Payments',
    desc: 'Cash, EcoCash mobile money, or corporate vouchers — your choice.',
    iconColor: '#fbbf24', bgColor: 'rgba(234,179,8,0.15)',
  },
  {
    icon: Shield,      title: 'Verified Drivers',
    desc: 'All drivers are background-checked and vehicle-verified for your safety.',
    iconColor: '#f87171', bgColor: 'rgba(239,68,68,0.15)',
  },
  {
    icon: Star,        title: 'Rating System',
    desc: 'Rate your experience and help maintain service quality across the platform.',
    iconColor: '#fb923c', bgColor: 'rgba(249,115,22,0.15)',
  },
]
