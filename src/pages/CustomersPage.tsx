import { useState, useEffect, type FormEvent } from "react";
import { useCustomers } from "../hooks/useCustomers";
import { useAuth } from "../hooks/useAuth";
import WhatsAppButton from "../components/WhatsAppButton";
import type { Customer } from "../types/database";

interface CustomerFormData {
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const emptyForm: CustomerFormData = {
  name: "",
  phone: "",
  address: "",
  notes: "",
};

/**
 * Kundenverwaltung – nur für Administratoren.
 * Kunden registrieren sich nicht selbst; alle CRUD-Operationen laufen über den Admin.
 */
export default function CustomersPage() {
  const { isAdmin } = useAuth();
  const { customers, loading, error, getCustomers, upsertCustomer, deleteCustomer } =
    useCustomers();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    void getCustomers();
  }, [getCustomers]);

  const openAdd = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setFormError("Nur Administratoren dürfen Kunden verwalten.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Name ist erforderlich");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await upsertCustomer({
        ...(editingCustomer ? { id: editingCustomer.id } : {}),
        name: form.name.trim(),
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      });
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    await deleteCustomer(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="master-page">
      <div className="page-actions">
        {isAdmin && (
          <button className="btn-primary" onClick={openAdd}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="2" x2="8" y2="14" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
            Neuer Kunde
          </button>
        )}
      </div>

      {loading && customers.length === 0 && <div className="status-msg">Laden…</div>}
      {error && <div className="status-msg error">{error}</div>}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Telefon</th>
              <th>Adresse</th>
              <th>Notizen</th>
              <th className="col-actions">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Noch keine Kunden.{" "}
                  {isAdmin && (
                    <button className="link-btn" onClick={openAdd}>
                      Ersten Kunden anlegen →
                    </button>
                  )}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="color-dot" style={{ background: c.color }} />
                  <span className="font-medium">{c.name}</span>
                </td>
                <td>
                  <span className="phone-cell">
                    {c.phone || "—"}
                    <WhatsAppButton phone={c.phone} />
                  </span>
                </td>
                <td>{c.address || "—"}</td>
                <td className="notes-cell">{c.notes || "—"}</td>
                <td className="col-actions">
                  {isAdmin && (
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && isAdmin && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCustomer ? "Kunde bearbeiten" : "Neuer Kunde"}</h2>
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
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">Telefonnummer</label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={saving}
                />
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
                <label htmlFor="notes">Notizen</label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  disabled={saving}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Speichern…" : editingCustomer ? "Änderungen speichern" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
