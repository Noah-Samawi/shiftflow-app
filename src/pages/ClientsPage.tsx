import { useState, useEffect, type FormEvent } from "react";
import { useClients } from "../hooks/useClients";
import type { Client } from "../types/database";

const PRESET_COLORS = [
  "#E67E22", "#E74C3C", "#27AE60", "#F39C12", "#6C3483",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#E11D48",
];

interface ClientFormData {
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  notes: string;
  color: string;
}

const emptyForm: ClientFormData = {
  name: "",
  contact_person: "",
  phone: "",
  address: "",
  notes: "",
  color: "#E67E22",
};

export default function ClientsPage() {
  const { clients, loading, error, getClients, upsertClient, deleteClient } = useClients();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    getClients();
  }, [getClients]);

  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      contact_person: client.contact_person || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || "",
      color: client.color,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Name ist erforderlich");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await upsertClient({
        ...(editingClient ? { id: editingClient.id } : {}),
        name: form.name.trim(),
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        color: form.color,
      });
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteClient(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="master-page">
      {/* Header */}
      <div className="page-actions">
        <button className="btn-primary" onClick={openAdd}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="2" x2="8" y2="14" />
            <line x1="2" y1="8" x2="14" y2="8" />
          </svg>
          Neuer Kunde
        </button>
      </div>

      {loading && clients.length === 0 && (
        <div className="status-msg">Laden…</div>
      )}
      {error && <div className="status-msg error">{error}</div>}

      {/* Table */}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kontaktperson</th>
              <th>Telefon</th>
              <th>Adresse</th>
              <th className="col-actions">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Noch keine Kunden.{" "}
                  <button className="link-btn" onClick={openAdd}>
                    Ersten Kunden anlegen →
                  </button>
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="color-dot" style={{ background: c.color }} />
                  <span className="font-medium">{c.name}</span>
                </td>
                <td>{c.contact_person || "—"}</td>
                <td>{c.phone || "—"}</td>
                <td>{c.address || "—"}</td>
                <td className="col-actions">
                  <div className="row-actions">
                    <button
                      className="row-action-btn"
                      onClick={() => openEdit(c)}
                      title="Bearbeiten"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                      </svg>
                    </button>
                    {deleteConfirm === c.id ? (
                      <div className="delete-confirm-inline">
                        <button
                          className="row-action-btn row-action-btn--danger"
                          onClick={() => handleDelete(c.id)}
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
                        onClick={() => setDeleteConfirm(c.id)}
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingClient ? "Kunde bearbeiten" : "Neuer Kunde"}</h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              {formError && <div className="modal-error">{formError}</div>}

              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input id="name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={saving} />
              </div>

              <div className="modal-row">
                <div className="form-group">
                  <label htmlFor="contact">Kontaktperson</label>
                  <input id="contact" type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} disabled={saving} />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Telefon</label>
                  <input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={saving} />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="address">Adresse</label>
                <input id="address" type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={saving} />
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notizen</label>
                <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} disabled={saving} />
              </div>

              <div className="form-group">
                <label>Farbe</label>
                <div className="color-picker">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-swatch ${form.color === c ? "color-swatch--active" : ""}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm({ ...form, color: c })}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="color-input-native"
                    title="Benutzerdefinierte Farbe"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Speichern…" : editingClient ? "Änderungen speichern" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
