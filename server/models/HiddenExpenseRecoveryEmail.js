const { model, Schema } = require('mongoose');

module.exports = model(
  'HiddenExpenseRecoveryEmail',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      to: { type: String, required: true },
      token: { type: String, required: true, select: false },
      tokenHash: { type: String, required: true },
      expiresAt: { type: Date, required: true, expires: 0 },
      sentAt: { type: Date },
      attempts: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);
