export function StarRating({ value }: { value: number }) {
  const stars = 5;
  return (
    <span className="star-rating" aria-label={`Rating ${value} out of 5`}>
      {Array.from({ length: stars }, (_, i) => (
        <span key={i} className={i < value ? undefined : "star-rating-empty"}>
          ★
        </span>
      ))}
    </span>
  );
}
