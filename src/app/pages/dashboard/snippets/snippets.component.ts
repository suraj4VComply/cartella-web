import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ALL_SNIPPETS_FOLDER } from '@app/config/snippets.config';
import { Technology } from '@app/interfaces/technology.interface';
import { User } from '@app/interfaces/user.interface';
import { MenuService } from '@app/services/menu/menu.service';
import { StorageFolders } from '@app/services/storage/storage.interface';
import { StorageService } from '@app/services/storage/storage.service';
import { TechnologyState } from '@app/store/states/technology.state';
import { DialogService } from '@ngneat/dialog';
import { Select, Store } from '@ngxs/store';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { SubSink } from 'subsink';
import { SnippetsAddFolderComponent } from './components/modals/snippets-add-folder/snippets-add-folder.component';
import {
  Snippet,
  SnippetFolder,
  SnippetModes,
} from './shared/interfaces/snippets.interface';
import {
  GetSnippetFolders,
  SetActiveSnippetFolder,
} from './store/actions/snippets-folders.action';
import { GetSnippets, SetActiveSnippet } from './store/actions/snippets.action';
import { SnippetFolderState } from './store/states/snippet-folders.state';
import { SnippetState } from './store/states/snippets.state';

@Component({
  selector: 'app-snippets',
  templateUrl: './snippets.component.html',
  styleUrls: ['./snippets.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnippetsComponent implements OnInit, OnDestroy {
  @Select(SnippetState.getAllSnippets)
  allSnippets$: Observable<Snippet[]>;

  @Select(SnippetFolderState.getAllSnippetFolders)
  allSnippetFolders$: Observable<SnippetFolder[]>;

  @Select(SnippetState.getSnippetsShown)
  snippetsShown$: Observable<Snippet[]>;

  @Select(SnippetState.getActiveSnippet)
  activeSnippet$: Observable<Snippet>;

  @Select(SnippetFolderState.getAllSnippetFolders)
  folders$: Observable<SnippetFolder[]>;

  @Select(SnippetFolderState.getActiveSnippetFolder)
  activeFolder$: Observable<SnippetFolder>;

  @Select(TechnologyState.getTechnologiesList)
  technologies$: Observable<Technology[]>;

  @Select(SnippetState.getSnippetFetched)
  snippetsFetched$: Observable<boolean>;

  @Select(SnippetFolderState.getSnippetFolderFetched)
  snippetFolderFetched$: Observable<boolean>;

  user: User;
  isLargeScreen = true;
  isMenuOpen$: Observable<boolean>;

  private snippetFolderLoadingSubject = new BehaviorSubject(false);
  snippetFolderLoading$ = this.snippetFolderLoadingSubject.pipe();

  private snippetLoadingSubject = new BehaviorSubject(false);
  snippetLoading$ = this.snippetLoadingSubject.pipe();
  private isLargeScreenSubject = new BehaviorSubject(this.isLargeScreen);
  isLargeScree$ = this.isLargeScreenSubject.pipe(
    tap((data) => (this.isLargeScreen = data))
  );

  private modeSubject = new BehaviorSubject(SnippetModes.explorer);
  mode$ = this.modeSubject.pipe();
  availableModes = SnippetModes;

  private subs = new SubSink();
  constructor(
    private activatedRoute: ActivatedRoute,
    private store: Store,
    private dialog: DialogService,
    private menu: MenuService,
    private breakpointObserver: BreakpointObserver,
    private storage: StorageService
  ) {}

  ngOnInit(): void {
    this.getSnippetFolders();
    this.getSnippets();
    this.observeLayoutChanges();
    this.updateSnippetFoldersInIDB();
    this.updateSnippetsInIDB();
    this.isMenuOpen$ = this.menu.isMenuOpen$;
  }
  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  get snippetSlug() {
    return this.activatedRoute.snapshot.paramMap.get('slug');
  }

  closeMenu() {
    this.menu.closeMenu();
  }

  toggleMenu() {
    this.menu.toggleMenu();
  }

  changeMode(mode: SnippetModes) {
    this.modeSubject.next(mode);
  }

  handleSelectFolder(folder: SnippetFolder) {
    if (folder) {
      this.snippetLoadingSubject.next(true);
      this.store.dispatch(new SetActiveSnippetFolder(folder));
      this.store.dispatch(new SetActiveSnippet(null));
      const sub = this.store.dispatch(new GetSnippets(folder.id)).subscribe(
        () => {
          this.snippetLoadingSubject.next(false);
        },
        () => {
          this.snippetLoadingSubject.next(false);
        }
      );
      this.subs.add(sub);
    }
  }
  handleEditFolder(folder: SnippetFolder) {
    this.dialog.open(SnippetsAddFolderComponent, {
      size: 'sm',
      data: {
        folder,
        type: 'UPDATE',
      },
      enableClose: false,
    });
  }

  handleCreateFolder() {
    this.dialog.open(SnippetsAddFolderComponent, {
      size: 'sm',
      enableClose: false,
      data: {
        type: 'CREATE',
      },
    });
  }

  private getSnippets() {
    this.snippetLoadingSubject.next(true);
    const folderState = this.store.selectSnapshot(
      (state) => state.snippetFolders
    );
    this.store
      .dispatch(new GetSnippets(folderState?.activeSnippetFolder?.id))
      .subscribe(
        () => {
          this.snippetLoadingSubject.next(false);
        },
        () => {
          this.snippetLoadingSubject.next(false);
        }
      );
  }
  private getSnippetFolders() {
    this.snippetFolderLoadingSubject.next(true);
    const sub = this.store.dispatch(new GetSnippetFolders()).subscribe(
      () => {
        this.snippetFolderLoadingSubject.next(false);
      },
      () => {
        this.snippetFolderLoadingSubject.next(false);
      }
    );
    this.subs.add(sub);
    this.store.dispatch(new SetActiveSnippetFolder(ALL_SNIPPETS_FOLDER));
  }

  private observeLayoutChanges() {
    this.subs.add(
      this.breakpointObserver
        .observe(['(min-width: 768px)'])
        .subscribe((result) => {
          this.isLargeScreenSubject.next(result.matches);
        })
    );
  }

  private updateSnippetsInIDB() {
    const sub = this.allSnippets$
      .pipe(
        filter((res) => res.length > 0),
        tap((snippets: Snippet[]) => {
          this.saveStarredSnippets(snippets);
        }),
        switchMap((snippets: Snippet[]) =>
          this.groupSnippetsInFolders(snippets)
        ),
        tap((foldersWithSnippets) => {
          this.saveSnippetsInIDB(foldersWithSnippets);
        })
      )
      .subscribe();
    this.subs.add(sub);
  }

  private updateSnippetFoldersInIDB() {
    const sub = this.allSnippetFolders$
      .pipe(
        filter((res) => res.length > 0),
        tap((snippets) => {
          this.storage.setItem(StorageFolders.folders, 'snippets', snippets);
        })
      )
      .subscribe();
    this.subs.add(sub);
  }

  private groupSnippetsInFolders = (snippets: Snippet[]) =>
    this.allSnippetFolders$.pipe(
      map((folders: SnippetFolder[]) =>
        folders.map(({ id }) => ({
          [id]: snippets.filter(
            ({ folder: { id: folderId } }) => folderId === id
          ),
        }))
      )
    );

  private saveSnippetsInIDB = (
    foldersWithSnippets: {
      [key: string]: Snippet[];
    }[]
  ) => {
    Object.keys(foldersWithSnippets).forEach((key) => {
      this.storage.setItem(
        StorageFolders.snippets,
        key,
        foldersWithSnippets[key]
      );
    });
  };

  private saveStarredSnippets = (snippets: Snippet[]) => {
    this.storage.setItem(
      StorageFolders.snippets,
      'starred',
      snippets.filter(({ favorite }) => favorite)
    );
  };
}
