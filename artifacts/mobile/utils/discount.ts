// The discount arithmetic lives in @workspace/utils so the shared web bill
// runs exactly the same maths as the app.
export {
  applyAmount,
  applyPercent,
  apportion,
  baseTotalOf,
  discountAt,
  discountRate,
  inferDiscountSelection,
  parsePercent,
  percentInput,
  percentLabel,
  totalDiscount,
  type DiscountableLine,
  type InferredDiscount,
  type LineDiscount,
} from "@workspace/utils";
