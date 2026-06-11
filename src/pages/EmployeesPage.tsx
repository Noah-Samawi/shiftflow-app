import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useProfiles } from "../hooks/useProfiles";
import { useAuth } from "../hooks/useAuth";
import { usePagination } from "../hooks/usePagination";
import WhatsAppButton from "../components/WhatsAppButton";
import PrintButton from "../components/PrintButton";
import TablePagination from "../components/TablePagination";
import { generateInviteLink, buildInviteMessage } from "../utils/inviteLink";
import { buildWhatsAppLink } from "../utils/whatsapp";
import type { Profile } from "../types/database";

interface WeeklyStats {
  employee_id: string;
  hours_this_week: number;
}

interface EmployeeFormData {
  full_name: string;
  phone: string;
  address: string;
  weekly_hours: number;
  role: Profile["role"];
  email: string;
}

const emptyForm: EmployeeFormData = {
  full_name: "",
  phone: "",
  address: "",
  weekly_hours: 40,
  role: "employee",
  email: "",
};

export default function EmployeesPage() {
  const { isAdmin, user } = useAuth();
  const {
    profiles,
    loading,
    error,
    getProfiles,
    createEmployeeByEmail,
    updateProfile,
    deleteProfile,
  } = useProfiles();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<EmployeeFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<Record<string, number>>({});
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");

  // Pagination (10/25/50) — hält die gerenderte Liste performant
  const {
    pageItems: pagedProfiles,
    page,
    pageSize,
    pageCount,
    totalItems,
    firstItem,
    lastItem,
    setPage,
    setPageSize,
  } = usePagination(profiles, 10);

  useEffect(() => {
    void getProfiles();
  }, [getProfiles]);

  useEffect(() => {
    if (profiles.length === 0) return;

    const loadHours = async () => {
      const { data } = await supabase
        .from("employee_weekly_hours")
        .select("employee_id, hours_this_week");

      if (data) {
        const map: Record<string, number> = {};
        data.forEach((row: WeeklyStats) => {
          map[row.employee_id] = Number(row.hours_this_week);
        });
        setWeeklyStats(map);
      }
    };

    void loadHours();
  }, [profiles]);

  // Load current user's org
  useEffect(() => {
    async function loadOrg() {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("org_id, organizations(name)")
        .eq("id", user.id)
        .single();
      if (data?.org_id) {
        setOrgId(data.org_id as string);
        const org = (data.organizations as unknown as { name: string } | null)?.name ?? "";
        setOrgName(org);
      }
    }
    void loadOrg();
  }, [user?.id]);

  const openAdd = () => {
    setEditingProfile(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (profile: Profile) => {
    setEditingProfile(profile);
    setForm({
      full_name: profile.full_name,
      phone: profile.phone || "",
      address: profile.address || "",
      weekly_hours: profile.weekly_hours,
      role: profile.role,
      email: "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setFormError("Name ist erforderlich");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingProfile) {
        await updateProfile(editingProfile.id, {
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          address: form.address || null,
          weekly_hours: form.weekly_hours,
          role: form.role,
        });
      } else {
        if (!isAdmin) {
          setFormError("Nur Administratoren dürfen Mitarbeiter anlegen.");
          setSaving(false);
          return;
        }
        if (!form.email.trim()) {
          setFormError("E-Mail ist erforderlich");
          setSaving(false);
          return;
        }
        // RPC legt auth.users + public.profiles (Rolle employee) atomar an
        await createEmployeeByEmail({
          email: form.email,
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          address: form.address || null,
          weekly_hours: form.weekly_hours,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProfile(id);
    setDeleteConfirm(null);
  };

  const handleInviteWhatsApp = (profile: Profile) => {
    if (!orgId || !profile.phone) return;
    const link = generateInviteLink(orgId, profile.phone);
    const msg = buildInviteMessage(orgName || "M. Sharif Nachbarschaftshilfe", link);
    const waUrl = buildWhatsAppLink(profile.phone, msg);
    if (waUrl) {
      window.open(waUrl, "_blank");
    }
  };

  return (
    <div className="master-page">
      <div className="page-actions">
        <div className="page-actions__group">
          <PrintButton />
          {isAdmin && (
            <button className="btn-primary" onClick={openAdd}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="2" x2="8" y2="14" />
                <line x1="2" y1="8" x2="14" y2="8" />
              </svg>
              Neuer Mitarbeiter
            </button>
          )}
        </div>
      </div>

      {loading && profiles.length === 0 && <div className="status-msg">Laden…</div>}
      {error && <div className="status-msg error">{error}</div>}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Telefon</th>
              <th>Adresse</th>
              <th>Wochenstunden</th>
              <th>Rolle</th>
              <th className="col-actions">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Noch keine Mitarbeiter.{" "}
                  {isAdmin && (
                    <button className="link-btn" onClick={openAdd}>
                      Ersten Mitarbeiter anlegen →
                    </button>
                  )}
                </td>
              </tr>
            )}
            {pagedProfiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="employee-name-cell">
                    <div className="user-avatar-sm">
                      {p.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{p.full_name}</span>
                  </div>
                </td>
                <td>
                  <span className="phone-cell">
                    {p.phone || "—"}
                    <WhatsAppButton phone={p.phone} />
                  </span>
                </td>
                <td>{p.address || "—"}</td>
                <td>
                  {(() => {
                    const actual = weeklyStats[p.id] ?? 0;
                    const max = p.weekly_hours ?? 40;
                    const pct = Math.min(100, Math.round((actual / max) * 100));
                    return (
                      <div className="employee-hours-col">
                        <span className={`employee-hours-value ${
                          actual === 0 ? "text-gray-400" : actual >= max ? "text-red-600" : "text-green-700"
                        }`}>
                          {actual > 0 ? `${actual} Std.` : "— Std."}
                        </span>
                        <div className="employee-hours-bar">
                          <div
                            className={`employee-hours-fill ${
                              pct >= 100 ? "hours-red" : pct >= 80 ? "hours-amber" : "hours-green"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="employee-hours-max">von {max} Std.</span>
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <span className={`role-badge ${p.role === "admin" ? "role-badge--admin" : ""}`}>
                    {p.role === "admin" ? "Admin" : "Mitarbeiter"}
                  </span>
                </td>
                <td className="col-actions">
                  {isAdmin && (
                    <div className="row-actions">
                      <button
                        className="row-action-btn"
                        onClick={() => openEdit(p)}
                        title="Bearbeiten"
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                        </svg>
                      </button>
                      {p.phone && orgId && (
                        <button
                          className="row-action-btn"
                          onClick={() => handleInviteWhatsApp(p)}
                          title="Per WhatsApp einladen"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                        </button>
                      )}
                      {deleteConfirm === p.id ? (
                        <div className="delete-confirm-inline">
                          <button
                            className="row-action-btn row-action-btn--danger"
                            onClick={() => handleDelete(p.id)}
                            title="Löschen bestätigen"
                          >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M13 4L3 14" />
                              <path d="M3 4l10 10" />
                            </svg>
                          </button>
                          <button
                            className="row-action-btn"
                            onClick={() => setDeleteConfirm(null)}
                            title="Abbrechen"
                          >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M4 8h8" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          className="row-action-btn row-action-btn--danger"
                          onClick={() => setDeleteConfirm(p.id)}
                          title="Löschen"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 4h12" />
                            <path d="M5 4V2h6v2" />
                            <path d="M3 4l1 10h8l1-10" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        totalItems={totalItems}
        firstItem={firstItem}
        lastItem={lastItem}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel="Mitarbeiter"
      />

      {modalOpen && isAdmin && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProfile ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              {formError && <div className="modal-error">{formError}</div>}

              {!editingProfile && (
                <div className="form-group">
                  <label htmlFor="email">E-Mail-Adresse *</label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    disabled={saving}
                    placeholder="mitarbeiter@beispiel.de"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="fullname">Vollständiger Name *</label>
                <input
                  id="fullname"
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  disabled={saving}
                />
              </div>

              <div className="modal-row">
                <div className="form-group">
                  <label htmlFor="phone">Telefon</label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="hours">Wochenstunden</label>
                  <input
                    id="hours"
                    type="number"
                    min="0"
                    max="80"
                    value={form.weekly_hours}
                    onChange={(e) =>
                      setForm({ ...form, weekly_hours: parseInt(e.target.value, 10) || 0 })
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="address">Adresse</label>
                <input
                  id="address"
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label>Rolle</label>
                <div className="role-toggle">
                  <button
                    type="button"
                    className={`role-toggle-btn ${form.role === "employee" ? "role-toggle-btn--active" : ""}`}
                    onClick={() => setForm({ ...form, role: "employee" })}
                  >
                    Mitarbeiter
                  </button>
                  <button
                    type="button"
                    className={`role-toggle-btn ${form.role === "admin" ? "role-toggle-btn--active" : ""}`}
                    onClick={() => setForm({ ...form, role: "admin" })}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {!editingProfile && (
                <div className="form-hint">
                  Der Mitarbeiter erhält ein Konto mit dieser E-Mail. Zum ersten Login kann er
                  „Passwort vergessen“ auf der Anmeldeseite nutzen.
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Speichern…" : editingProfile ? "Änderungen speichern" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
