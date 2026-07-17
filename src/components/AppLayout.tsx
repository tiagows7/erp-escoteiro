import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  NAV_ITEMS,
  type NavGroupItem,
  type NavLinkItem,
} from '@/config/navigation'

function groupHasVisibleChild(
  group: NavGroupItem,
  hasPermission: (p: NonNullable<NavLinkItem['permission']>) => boolean,
) {
  return group.children.some(
    (child) => !child.permission || hasPermission(child.permission),
  )
}

export function AppLayout() {
  const { profile, empresa, roleLabel, hasPermission, isSuperAdmin, signOut } =
    useAuth()
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)

  const items = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.type === 'link') {
        return !item.permission || hasPermission(item.permission)
      }
      if (item.anyOf && !item.anyOf.some((p) => hasPermission(p))) {
        return false
      }
      return groupHasVisibleChild(item, hasPermission)
    })
  }, [hasPermission])

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev }
      for (const item of NAV_ITEMS) {
        if (item.type !== 'group') continue
        const childActive = item.children.some(
          (child) =>
            location.pathname === child.to ||
            location.pathname.startsWith(`${child.to}/`),
        )
        if (childActive) next[item.id] = true
      }
      return next
    })
  }, [location.pathname])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const grupoLabel = isSuperAdmin
    ? 'Plataforma · todos os grupos'
    : (empresa?.nome ?? 'Grupo Escoteiro')

  return (
    <div className={`app-shell${menuOpen ? ' menu-open' : ''}`}>
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="mobile-menu-icon" aria-hidden="true">
            {menuOpen ? '✕' : '☰'}
          </span>
        </button>
        <img
          className="mobile-topbar-logo"
          src={empresa?.logo_url || '/logo-erp.png'}
          alt=""
          width={36}
          height={36}
        />
        <div className="mobile-topbar-text">
          <strong>ERP Escoteiro</strong>
          <span>{grupoLabel}</span>
        </div>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          <img
            className="brand-logo"
            src={empresa?.logo_url || '/logo-erp.png'}
            alt={empresa?.nome ?? 'ERP Escoteiro'}
            width={72}
            height={72}
          />
          <p>{grupoLabel}</p>
        </div>

        <nav className="nav-group" aria-label="Principal">
          <div className="nav-label">Menu</div>
          {items.map((item) => {
            if (item.type === 'link') {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              )
            }

            const open = !!openGroups[item.id]
            const childActive = item.children.some(
              (child) =>
                location.pathname === child.to ||
                location.pathname.startsWith(`${child.to}/`),
            )
            const visibleChildren = item.children.filter(
              (child) => !child.permission || hasPermission(child.permission),
            )

            return (
              <div
                key={item.id}
                className={`nav-submenu${open ? ' open' : ''}${childActive ? ' has-active' : ''}`}
              >
                <button
                  type="button"
                  className={`nav-group-toggle${childActive ? ' active' : ''}`}
                  aria-expanded={open}
                  onClick={() => toggleGroup(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="nav-caret" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                {open ? (
                  <div className="nav-submenu-items">
                    {visibleChildren.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        className={({ isActive }) =>
                          `nav-link nav-sublink${isActive ? ' active' : ''}`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>{profile?.nome ?? 'Usuário'}</strong>
          <span>{roleLabel ?? profile?.username ?? '—'}</span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={() => void signOut()}
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
