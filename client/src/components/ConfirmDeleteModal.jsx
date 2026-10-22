import { createPortal } from 'react-dom';

export default function ConfirmDeleteModal({
  open,
  title = 'Delete this item?',
  description,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return createPortal(
    <div className="modal d-block modal-backdrop-custom" role="presentation">
      <div className="modal-dialog modal-dialog-centered" role="dialog" aria-modal="true" aria-labelledby="delete-confirmation-title">
        <div className="modal-content expense-modal">
          <div className="modal-body p-4">
            <span className="eyebrow">CONFIRM DELETION</span>
            <h5 className="mt-2" id="delete-confirmation-title">{title}</h5>
            <p className="muted mb-0">{description}</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" onClick={onCancel}>Cancel</button>
            <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
