const { model, Schema } = require('mongoose');

module.exports = model(
  'ScheduledMessage',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      contactName: { type: String, trim: true, required: true },
      email: { type: String, trim: true, lowercase: true },
      recipientConsented: { type: Boolean, required: true, default: false },
      channel: { type: String, enum: ['email'], default: 'email' },
      messageType: {
        type: String,
        enum: ['love', 'greeting', 'celebration', 'custom'],
        default: 'greeting',
      },
      message: { type: String, trim: true, required: true, maxlength: 1500 },
      frequency: {
        type: String,
        enum: ['once', 'daily', 'weekly', 'monthly', 'custom'],
        default: 'once',
      },
      intervalDays: { type: Number, min: 1, max: 365 },
      timeZone: { type: String, default: 'Asia/Kolkata' },
      scheduledAt: { type: Date, required: true },
      nextSendAt: { type: Date, required: true, index: true },
      endAt: Date,
      active: { type: Boolean, default: true },
      lockedAt: Date,
      lastSentAt: Date,
      lastError: String,
    },
    { timestamps: true },
  ).index({ active: 1, nextSendAt: 1 }),
);
