const { model, Schema } = require('mongoose');
module.exports = model(
  'Expense',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      date: { type: Date, required: true },
      amount: { type: Number, required: true, min: 0.01 },
      item: { type: String, trim: true },
      category: { type: String, default: 'Other' },
      subcategory: String,
      hasSubtypes: { type: Boolean, default: false },
      subtypes: [
        {
          type: { type: String, trim: true },
          amount: { type: Number, min: 0.01 },
          paymentMethod: { type: String, default: 'Cash' },
        },
      ],
      description: { type: String, trim: true },
      paymentMethod: { type: String, default: 'Cash' },
      notes: String,
      isLocked: { type: Boolean, default: false },
    },
    { timestamps: true },
  )
    .index({ userId: 1, date: -1 })
    .index({ userId: 1, category: 1 }),
);
