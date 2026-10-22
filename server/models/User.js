const { model, Schema } = require('mongoose');
module.exports = model(
  'User',
  new Schema(
    {
      name: String,
      avatar: { type: String, default: '' },
      email: { type: String, unique: true, lowercase: true, required: true },
      password: { type: String, required: true },
      passwordResetTokenHash: { type: String, select: false },
      passwordResetExpires: { type: Date, select: false },
      hiddenExpenseKeyHash: { type: String, select: false },
      hiddenExpenseOtpHash: { type: String, select: false },
      hiddenExpenseOtpExpires: { type: Date, select: false },
      hiddenExpenseOtpSentAt: { type: Date, select: false },
      hiddenExpenseOtpAttempts: { type: Number, select: false },
    },
    { timestamps: true },
  ),
);
