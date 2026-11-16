const { collection, COLLECTIONS } = require('./index');

// Replaces the PostgreSQL `financial_expenses` view. Every payment in a month is debited from
// that month's funds: visible expenses, hidden expenses and paid reminders. Hidden expenses only
// contribute their amount; their names stay private so breakdowns show them as "Hidden expense".
// Expenses in the deleted-items bin are excluded.
function financialExpenses(userId, dateRange, stages = []) {
  const expenseMatch = { userId, deletedAt: null };
  if (dateRange) expenseMatch.date = dateRange;
  const paymentStages = [{ $match: { userId } }, { $unwind: '$payments' }];
  if (dateRange) paymentStages.push({ $match: { 'payments.paidAt': dateRange } });
  paymentStages.push({
    $project: {
      _id: 0,
      date: '$payments.paidAt',
      amount: '$payments.amount',
      item: '$title',
      category: { $literal: 'Reminders' },
      description: '$title',
    },
  });
  return collection('expenses').aggregate(
    [
      { $match: expenseMatch },
      {
        $project: {
          _id: 0,
          date: 1,
          amount: 1,
          item: { $cond: ['$isLocked', 'Hidden expense', { $ifNull: ['$item', null] }] },
          category: { $cond: ['$isLocked', 'Hidden', '$category'] },
          description: { $cond: ['$isLocked', 'Hidden expense', { $ifNull: ['$description', null] }] },
        },
      },
      { $unionWith: { coll: COLLECTIONS.reminders, pipeline: paymentStages } },
      ...stages,
    ],
    { allowDiskUse: true },
  );
}

module.exports = { financialExpenses };
