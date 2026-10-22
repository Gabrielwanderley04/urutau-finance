export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-titulo font-bold tracking-tight ${className}`}>
      urutau<span className="text-destaque-texto"> gestão</span>
    </span>
  );
}
