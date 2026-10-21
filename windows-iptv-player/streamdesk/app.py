from __future__ import annotations

import shutil
import subprocess
import tkinter as tk
import webbrowser
from tkinter import filedialog, messagebox, ttk
from typing import Any, Callable

from api import XtreamClient, XtreamError


MEDIA_TYPES = {
    "Canais": "live",
    "Filmes": "movie",
    "Séries": "series",
}
VLC_DOWNLOAD = "https://www.videolan.org/vlc/"


class StreamDeskApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.client: XtreamClient | None = None
        self.media_type = "live"
        self.items: list[dict[str, Any]] = []
        self.visible_items: list[dict[str, Any]] = []
        self.request_number = 0
        self.player_path = shutil.which("vlc") or shutil.which("vlc.exe")
        self._configure_window()
        self._build_ui()

    def _configure_window(self) -> None:
        self.root.title("StreamDesk")
        self.root.geometry("1050x700")
        self.root.minsize(780, 520)
        self.root.configure(bg="#10131a")
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure(".", font=("Segoe UI", 10))
        style.configure("TFrame", background="#10131a")
        style.configure("Card.TFrame", background="#191e29")
        style.configure("TLabel", background="#10131a", foreground="#edf1f7")
        style.configure("Card.TLabel", background="#191e29", foreground="#edf1f7")
        style.configure("Muted.TLabel", background="#10131a", foreground="#a8b1c2")
        style.configure(
            "TButton",
            background="#30394a",
            foreground="#f4f6fa",
            borderwidth=0,
            padding=(12, 8),
        )
        style.map("TButton", background=[("active", "#46536b")])
        style.configure(
            "Accent.TButton", background="#7c5cff", foreground="#ffffff", padding=(14, 9)
        )
        style.map("Accent.TButton", background=[("active", "#937cff")])
        style.configure(
            "TEntry", fieldbackground="#252c39", foreground="#f4f6fa", padding=8
        )
        style.configure(
            "TCombobox", fieldbackground="#252c39", foreground="#f4f6fa", padding=7
        )
        style.configure(
            "Treeview",
            background="#191e29",
            fieldbackground="#191e29",
            foreground="#edf1f7",
            borderwidth=0,
            rowheight=34,
        )
        style.configure(
            "Treeview.Heading",
            background="#252c39",
            foreground="#cbd3e1",
            borderwidth=0,
            padding=8,
        )
        style.map("Treeview", background=[("selected", "#473b79")])
        style.configure("TSeparator", background="#30394a")

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=(28, 22))
        outer.pack(fill="both", expand=True)

        header = ttk.Frame(outer)
        header.pack(fill="x", pady=(0, 18))
        ttk.Label(header, text="StreamDesk", font=("Segoe UI Semibold", 24)).pack(
            side="left"
        )
        ttk.Label(
            header,
            text="Reprodutor para seus serviços Xtream Codes",
            style="Muted.TLabel",
        ).pack(side="left", padx=(16, 0), pady=(9, 0))

        login = ttk.Frame(outer, style="Card.TFrame", padding=16)
        login.pack(fill="x", pady=(0, 16))
        for column, weight in enumerate((4, 2, 2, 0)):
            login.columnconfigure(column, weight=weight)
        ttk.Label(login, text="Endereço do servidor", style="Card.TLabel").grid(
            row=0, column=0, sticky="w", padx=(0, 12), pady=(0, 7)
        )
        ttk.Label(login, text="Usuário", style="Card.TLabel").grid(
            row=0, column=1, sticky="w", padx=(0, 12), pady=(0, 7)
        )
        ttk.Label(login, text="Senha", style="Card.TLabel").grid(
            row=0, column=2, sticky="w", padx=(0, 12), pady=(0, 7)
        )
        self.server_entry = ttk.Entry(login)
        self.server_entry.grid(row=1, column=0, sticky="ew", padx=(0, 12))
        self.server_entry.insert(0, "https://")
        self.username_entry = ttk.Entry(login)
        self.username_entry.grid(row=1, column=1, sticky="ew", padx=(0, 12))
        self.password_entry = ttk.Entry(login, show="●")
        self.password_entry.grid(row=1, column=2, sticky="ew", padx=(0, 12))
        self.password_entry.bind("<Return>", lambda _event: self.connect())
        self.connect_button = ttk.Button(
            login, text="Conectar", style="Accent.TButton", command=self.connect
        )
        self.connect_button.grid(row=1, column=3, sticky="e")

        controls = ttk.Frame(outer)
        controls.pack(fill="x", pady=(0, 12))
        self.mode_buttons: dict[str, ttk.Button] = {}
        for label, media_type in MEDIA_TYPES.items():
            button = ttk.Button(
                controls,
                text=label,
                command=lambda value=media_type: self.set_media_type(value),
            )
            button.pack(side="left", padx=(0, 8))
            self.mode_buttons[media_type] = button

        self.category_box = ttk.Combobox(controls, state="readonly", width=25)
        self.category_box.pack(side="left", padx=(12, 8))
        self.category_box.bind("<<ComboboxSelected>>", lambda _event: self.load_streams())
        self.category_lookup: dict[str, str] = {}
        self.search_entry = ttk.Entry(controls, width=28)
        self.search_entry.pack(side="left", fill="x", expand=True, padx=(8, 8))
        self.search_entry.insert(0, "Buscar...")
        self.search_entry.bind("<FocusIn>", self._clear_search_hint)
        self.search_entry.bind("<Return>", lambda _event: self.filter_items())
        ttk.Button(controls, text="Buscar", command=self.filter_items).pack(side="left")

        self.tree = ttk.Treeview(
            outer,
            columns=("details",),
            show="headings",
            selectmode="browse",
        )
        self.tree.heading("#1", text="Conteúdo")
        self.tree.column("#1", anchor="w", stretch=True)
        self.tree.pack(fill="both", expand=True)
        self.tree.bind("<Double-1>", lambda _event: self.play_selected())

        footer = ttk.Frame(outer)
        footer.pack(fill="x", pady=(12, 0))
        self.status_label = ttk.Label(
            footer, text="Informe os dados do seu servidor para começar.", style="Muted.TLabel"
        )
        self.status_label.pack(side="left", fill="x", expand=True)
        self.player_button = ttk.Button(
            footer, text="Selecionar VLC...", command=self.choose_player
        )
        self.player_button.pack(side="right", padx=(8, 0))
        ttk.Button(footer, text="Reproduzir", command=self.play_selected).pack(side="right")

    def _clear_search_hint(self, _event: tk.Event[Any]) -> None:
        if self.search_entry.get() == "Buscar...":
            self.search_entry.delete(0, "end")

    def _set_status(self, text: str) -> None:
        self.status_label.configure(text=text)

    def _run_background(
        self, operation: Callable[[], Any], on_success: Callable[[Any], None], status: str
    ) -> None:
        self.request_number += 1
        request_number = self.request_number
        self._set_status(status)
        self.connect_button.configure(state="disabled")

        def work() -> None:
            try:
                result = operation()
            except Exception as exc:
                self.root.after(
                    0, lambda error=exc: self._show_request_error(request_number, error)
                )
                return
            self.root.after(
                0, lambda value=result: self._finish_request(request_number, on_success, value)
            )

        import threading

        threading.Thread(target=work, daemon=True).start()

    def _finish_request(
        self, request_number: int, callback: Callable[[Any], None], result: Any
    ) -> None:
        if request_number != self.request_number:
            return
        self.connect_button.configure(state="normal")
        callback(result)

    def _show_request_error(self, request_number: int, error: Exception) -> None:
        if request_number != self.request_number:
            return
        self.connect_button.configure(state="normal")
        self._set_status("Não foi possível concluir a solicitação.")
        messagebox.showerror(
            "Falha na solicitação",
            str(error) if isinstance(error, (XtreamError, ValueError)) else f"Erro inesperado: {error}",
            parent=self.root,
        )

    def connect(self) -> None:
        try:
            client = XtreamClient(
                self.server_entry.get(),
                self.username_entry.get(),
                self.password_entry.get(),
            )
        except ValueError as exc:
            messagebox.showerror("Dados inválidos", str(exc), parent=self.root)
            return

        def authenticate_and_load() -> tuple[dict[str, Any], list[dict[str, Any]]]:
            account = client.authenticate()
            return account, client.categories("live")

        def connected(result: tuple[dict[str, Any], list[dict[str, Any]]]) -> None:
            self.client = client
            account, categories = result
            self.media_type = "live"
            self._show_categories(categories)
            status = "Conectado"
            expiry = account.get("exp_date")
            if expiry and str(expiry) != "0":
                status += f" · expira em {expiry}"
            self._set_status(status)
            self.load_streams()

        self._run_background(authenticate_and_load, connected, "Conectando ao servidor...")

    def set_media_type(self, media_type: str) -> None:
        if self.client is None:
            messagebox.showinfo(
                "Conecte-se primeiro", "Conecte-se a um servidor antes de abrir o catálogo.",
                parent=self.root,
            )
            return
        if media_type == self.media_type:
            return
        self.media_type = media_type
        self.items = []
        self.tree.delete(*self.tree.get_children())
        client = self.client

        def load_categories() -> list[dict[str, Any]]:
            return client.categories(media_type)

        self._run_background(
            load_categories,
            lambda categories: (self._show_categories(categories), self.load_streams()),
            "Carregando categorias...",
        )

    def _show_categories(self, categories: list[dict[str, Any]]) -> None:
        self.category_lookup = {"Todas as categorias": ""}
        for category in categories:
            category_id = str(category.get("category_id", ""))
            name = str(category.get("category_name", "Categoria"))
            self.category_lookup[name] = category_id
        self.category_box["values"] = list(self.category_lookup)
        self.category_box.set("Todas as categorias")

    def load_streams(self) -> None:
        if self.client is None:
            return
        category_id = self.category_lookup.get(self.category_box.get(), "")
        media_type = self.media_type
        client = self.client
        self._run_background(
            lambda: client.streams(media_type, category_id),
            self._display_items,
            "Carregando catálogo...",
        )

    def _display_items(self, items: list[dict[str, Any]]) -> None:
        self.items = items
        self.filter_items()
        self._set_status(f"{len(items)} itens carregados · dê duplo clique para reproduzir.")

    def filter_items(self) -> None:
        query = self.search_entry.get().strip().casefold()
        if query == "buscar...":
            query = ""
        self.tree.delete(*self.tree.get_children())
        self.visible_items = [
            item
            for item in self.items
            if not query
            or query in str(item.get("name", "")).casefold()
            or query in str(item.get("category_name", "")).casefold()
        ]
        for index, item in enumerate(self.visible_items):
            name = str(item.get("name", "Sem título"))
            details = str(item.get("category_name", ""))
            if self.media_type == "live":
                details = "Ao vivo" + (f" · {details}" if details else "")
            elif self.media_type == "movie":
                details = "Filme" + (f" · {details}" if details else "")
            else:
                details = "Série" + (f" · {details}" if details else "")
            self.tree.insert("", "end", iid=str(index), values=(f"{name}    ·    {details}",))
        if query:
            self._set_status(f"{len(self.visible_items)} resultado(s).")

    def play_selected(self) -> None:
        selected = self.tree.selection()
        if not selected:
            messagebox.showinfo("Selecione um título", "Selecione um item do catálogo.", parent=self.root)
            return
        item = self.visible_items[int(selected[0])]
        if self.media_type == "series":
            self._load_episodes(item)
            return
        if self.client is None:
            return
        stream_id = item.get("stream_id")
        if stream_id is None:
            messagebox.showerror("Conteúdo inválido", "O servidor não informou o ID do conteúdo.", parent=self.root)
            return
        extension = str(item.get("container_extension", "ts" if self.media_type == "live" else "mp4"))
        self._launch_stream(self.client.stream_url(self.media_type, str(stream_id), extension))

    def _load_episodes(self, series: dict[str, Any]) -> None:
        series_id = series.get("series_id")
        if series_id is None or self.client is None:
            messagebox.showerror("Série inválida", "O servidor não informou o ID da série.", parent=self.root)
            return
        client = self.client

        def show_episodes(info: dict[str, Any]) -> None:
            episodes = info.get("episodes")
            if not isinstance(episodes, dict):
                messagebox.showerror("Sem episódios", "O servidor não retornou episódios para esta série.", parent=self.root)
                return
            choices: list[tuple[str, dict[str, Any]]] = []
            for season, season_episodes in episodes.items():
                if not isinstance(season_episodes, list):
                    continue
                for episode in season_episodes:
                    if isinstance(episode, dict):
                        number = episode.get("episode_num", "")
                        title = episode.get("title") or episode.get("name") or f"Episódio {number}"
                        choices.append((f"Temporada {season} · Episódio {number} — {title}", episode))
            self._choose_episode(choices)

        self._run_background(
            lambda: client.series_info(str(series_id)),
            show_episodes,
            "Carregando episódios...",
        )

    def _choose_episode(self, episodes: list[tuple[str, dict[str, Any]]]) -> None:
        if not episodes:
            messagebox.showinfo("Sem episódios", "Não há episódios disponíveis para esta série.", parent=self.root)
            return
        dialog = tk.Toplevel(self.root)
        dialog.title("Escolher episódio")
        dialog.geometry("680x440")
        dialog.configure(bg="#10131a")
        dialog.transient(self.root)
        dialog.grab_set()
        ttk.Label(dialog, text="Selecione um episódio", font=("Segoe UI Semibold", 15)).pack(
            anchor="w", padx=16, pady=(16, 10)
        )
        listing = ttk.Treeview(dialog, columns=("episode",), show="headings", height=14)
        listing.heading("#1", text="Episódio")
        listing.column("#1", anchor="w")
        listing.pack(fill="both", expand=True, padx=16, pady=(0, 12))
        for index, (label, _episode) in enumerate(episodes):
            listing.insert("", "end", iid=str(index), values=(label,))

        def play_episode(_event: tk.Event[Any] | None = None) -> None:
            selection = listing.selection()
            if not selection:
                return
            episode = episodes[int(selection[0])][1]
            episode_id = episode.get("id")
            if episode_id is None or self.client is None:
                messagebox.showerror("Episódio inválido", "O servidor não informou o ID do episódio.", parent=dialog)
                return
            extension = str(episode.get("container_extension", "mp4"))
            url = self.client.stream_url("series", str(episode_id), extension)
            dialog.destroy()
            self._launch_stream(url)

        listing.bind("<Double-1>", play_episode)
        ttk.Button(dialog, text="Reproduzir", style="Accent.TButton", command=play_episode).pack(
            anchor="e", padx=16, pady=(0, 16)
        )

    def _launch_stream(self, url: str) -> None:
        if not self.player_path or not shutil.which(self.player_path):
            use_vlc = messagebox.askyesno(
                "VLC não encontrado",
                "Instale o VLC para reproduzir transmissões HLS e escolha o executável VLC. "
                "Deseja abrir a página oficial de download?",
                parent=self.root,
            )
            if use_vlc:
                webbrowser.open(VLC_DOWNLOAD)
            return
        try:
            subprocess.Popen([self.player_path, url], close_fds=True)
        except OSError as exc:
            messagebox.showerror("Falha ao abrir o VLC", str(exc), parent=self.root)

    def choose_player(self) -> None:
        path = filedialog.askopenfilename(
            title="Selecione o executável do VLC",
            filetypes=[("VLC media player", "vlc.exe"), ("Executáveis", "*.exe")],
        )
        if path:
            self.player_path = path
            self._set_status("VLC selecionado · reproduza um título do catálogo.")


def main() -> None:
    root = tk.Tk()
    StreamDeskApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
