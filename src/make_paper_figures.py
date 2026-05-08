"""Render the five paper figures."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "meta" / "critique.json"
OUT = ROOT / "paper" / "figs"

plt.rcParams.update(
    {
        "font.family": "serif",
        "font.size": 11,
        "axes.labelsize": 11,
        "axes.titlesize": 11.5,
        "xtick.labelsize": 10,
        "ytick.labelsize": 10,
        "legend.fontsize": 10,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "savefig.bbox": "tight",
        "savefig.dpi": 300,
    }
)
ACCENT = "#FF4F2C"
BAR = "#3B1E1C"
GREY = "#8A7D78"
INK = "#303030"
SECONDARY = "#C8803E"
AXIS_ACCENT = "#B33A24"
AXIS_GREY = "#5F5550"

MODEL_ABBREV = {
    "scalemae": "Scale-MAE",
    "tov": "TOV",
    "gpt4o": "GPT-4o",
    "lightgbm": "LightGBM",
    "seco": "SeCo",
    "anysat": "AnySat",
    "croma": "CROMA",
    "satlas": "Satlas",
    "dofa": "DOFA",
    "vit": "ViT",
}

BENCHMARK_ABBREV = {
    "nwpu-resisc45": "NWPU-RESISC45",
    "ucmerced": "UCMerced",
    "treesatai": "TreeSatAI",
    "eurosat": "EuroSAT",
    "mbigearthnet": "mBigEarthNet",
    "mcashewplantation": "mCashewPlant",
    "msacroptype": "mSACropType",
}


def _short_disagreement_label(model: str, benchmark: str) -> str:
    model_label = MODEL_ABBREV.get(model.lower(), model.replace("_", "-"))
    benchmark_label = BENCHMARK_ABBREV.get(benchmark.lower(), benchmark.replace("_", "-"))
    return f"{model_label} / {benchmark_label}"


def fig_benchmark_concentration(d):
    a = d["analyses"]["2_benchmark_concentration"]
    top = a["top_20"][:10]
    names = [t[0] for t in top][::-1]
    counts = [t[1] for t in top][::-1]
    fig, ax = plt.subplots(figsize=(3.2, 2.3))
    ax.barh(names, counts, color=BAR, height=0.72)
    ax.set_xlabel("# papers")
    ax.set_title(f"Top-10 of {a['n_unique_benchmarks']} benchmarks  (Gini={a['gini']:.2f})")
    for i, c in enumerate(counts):
        ax.text(c + 0.4, i, str(c), va="center", fontsize=9, color=INK)
    fig.savefig(OUT / "benchmark_concentration.pdf")
    plt.close(fig)


def fig_cherry_picking(d):
    a = d["analyses"]["3_cherry_picking"]
    hist = a["histogram"]
    edges = np.linspace(0, 1, 11)
    centers = (edges[:-1] + edges[1:]) / 2
    fig, ax = plt.subplots(figsize=(3.2, 2.1))
    ax.bar(centers, hist, width=0.09, color=BAR, edgecolor="white")
    ax.axvline(
        a["mean_overlap"], color=ACCENT, linewidth=1.4, label=f"mean={a['mean_overlap']:.2f}"
    )
    ax.set_xlabel("overlap with field-wide top-10")
    ax.set_ylabel("# papers")
    ax.set_title(
        f"{a['n_papers_with_zero_overlap']}/{a['n_total']} papers share zero top-10 benchmarks"
    )
    ax.legend(frameon=False, loc="upper right")
    fig.savefig(OUT / "cherry_picking.pdf")
    plt.close(fig)


def fig_concentration_by_year(d):
    a = d["analyses"]["2_benchmark_concentration"]
    by_year = a["by_year"]
    years = [y for y in sorted(int(y) for y in by_year) if by_year[str(y)]["n_papers"] >= 5]
    ginis = [by_year[str(y)]["gini"] for y in years]
    npapers = [by_year[str(y)]["n_papers"] for y in years]
    fig, ax = plt.subplots(figsize=(3.2, 2.1))
    ax.plot(years, ginis, marker="o", color=ACCENT, linewidth=1.6, label="Gini")
    ax.set_ylabel("Gini coefficient", color=AXIS_ACCENT)
    ax.tick_params(axis="y", colors=AXIS_ACCENT)
    ax.set_ylim(0, 0.5)
    ax2 = ax.twinx()
    ax2.bar(years, npapers, color=GREY, alpha=0.35, label="# papers")
    ax2.set_ylabel("# papers", color=AXIS_GREY)
    ax2.tick_params(axis="y", colors=AXIS_GREY)
    ax.set_xlabel("year")
    ax.set_title("No steady convergence")
    fig.savefig(OUT / "concentration_by_year.pdf")
    plt.close(fig)


def fig_divergence(d):
    a = d["analyses"]["1_reported_number_divergence"]
    n_tot = a["n_multi_paper_strict_full_tuples"]
    n5 = a["n_strict_spread_ge_5"]
    n10 = a["n_strict_spread_ge_10"]
    n20 = a["n_strict_spread_ge_20"]
    with plt.rc_context(
        {
            "font.size": 10,
            "axes.labelsize": 10,
            "axes.titlesize": 10.5,
            "xtick.labelsize": 9,
            "ytick.labelsize": 9,
            "legend.fontsize": 9,
        }
    ):
        fig, (ax1, ax2) = plt.subplots(
            1,
            2,
            figsize=(7.0, 2.45),
            constrained_layout=True,
            gridspec_kw={"width_ratios": [1.0, 1.35], "wspace": 0.14},
        )
        labels = [f"any\n(n={n_tot})", "≥5 pts", "≥10 pts", "≥20 pts"]
        vals = [n_tot, n5, n10, n20]
        colors = [GREY, BAR, SECONDARY, ACCENT]
        bars = ax1.bar(labels, vals, color=colors)
        for b, v in zip(bars, vals):
            ax1.text(
                b.get_x() + b.get_width() / 2,
                b.get_height() + n_tot * 0.015,
                str(v),
                ha="center",
                fontsize=9,
                color=INK,
            )
        ax1.set_ylabel("# (model, benchmark,\nmetric, eval) tuples")
        ax1.set_title("Cross-paper spread, same eval protocol")
        plt.setp(ax1.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
        top = a["top_divergent_strict_full_50"][:10][::-1]
        labs = [_short_disagreement_label(t["model"], t["benchmark"]) for t in top]
        mins = [t["min"] for t in top]
        maxs = [t["max"] for t in top]
        y = np.arange(len(top))
        ax2.hlines(y, mins, maxs, color=BAR, linewidth=2.2, alpha=0.7)
        ax2.scatter(mins, y, color=BAR, s=16, zorder=3)
        ax2.scatter(maxs, y, color=ACCENT, s=16, zorder=3)
        for i, t in enumerate(top):
            ax2.text(t["max"] + 1.5, i, f"Δ={t['spread']:.0f}", va="center", fontsize=8, color=INK)
        ax2.set_yticks(y)
        ax2.set_yticklabels(labs, fontsize=8)
        ax2.tick_params(axis="y", pad=4)
        ax2.set_xlabel("reported metric value (%)")
        ax2.set_title("Top-10 same-protocol disagreements")
        ax2.set_xlim(0, 108)
        fig.savefig(OUT / "divergence.pdf")
        plt.close(fig)


def fig_pretrain_data(d):
    a = d["analyses"]["8_pretrain_data_concentration"]
    top = a["top_20_datasets"][:10]
    names = [t[0] for t in top][::-1]
    counts = [t[1] for t in top][::-1]
    fig, ax = plt.subplots(figsize=(3.2, 2.3))
    ax.barh(names, counts, color=BAR, height=0.72)
    for i, c in enumerate(counts):
        ax.text(c + 0.2, i, str(c), va="center", fontsize=9, color=INK)
    ax.set_xlabel("# papers pretraining on this dataset")
    ax.set_title(f"Top-10 of {a['n_unique_named_datasets']} pretraining corpora")
    fig.savefig(OUT / "pretrain_data.pdf")
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    d = json.loads(SRC.read_text())
    fig_benchmark_concentration(d)
    fig_cherry_picking(d)
    fig_concentration_by_year(d)
    fig_pretrain_data(d)
    fig_divergence(d)
    print(f"wrote 5 figures to {OUT}")


if __name__ == "__main__":
    main()
