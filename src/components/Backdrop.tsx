import bgAurora from "@/assets/bg-aurora.jpg";
import bgSilk from "@/assets/bg-silk.jpg";

export function Backdrop({ variant = "aurora" }: { variant?: "aurora" | "silk" }) {
  const src = variant === "silk" ? bgSilk : bgAurora;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        src={src}
        alt=""
        width={1920}
        height={1200}
        className="h-full w-full scale-105 object-cover"
      />
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute -left-40 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-primary/25 blur-[140px]" />
      <div className="absolute -right-32 bottom-[-15%] h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-[150px]" />
    </div>
  );
}
