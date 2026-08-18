export function productBadgeState(product = {}) {
  return {
    bestSeller: product.is_best_seller === true,
    restaurantPick: product.is_featured === true,
  }
}
