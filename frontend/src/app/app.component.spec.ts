import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { ChatService } from './services/chat.service';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let chatService: ChatService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, HttpClientTestingModule],
      providers: [ChatService]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    chatService = TestBed.inject(ChatService);
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should have the correct title', () => {
    expect(component.title).toEqual('Indian Election Guide');
  });

  it('should fetch elections on init', () => {
    const mockElections = [{ state: 'Test State', date: 'Test Date' }];
    spyOn(chatService, 'getUpcomingElections').and.returnValue(of(mockElections));
    
    component.ngOnInit();
    
    expect(component.upcomingElections).toEqual(mockElections);
    expect(component.isLoadingElections).toBeFalse();
  });

  it('should handle election fetch error', () => {
    spyOn(chatService, 'getUpcomingElections').and.returnValue(throwError(() => new Error('API Error')));
    spyOn(console, 'error');
    
    component.fetchElections();
    
    expect(component.isLoadingElections).toBeFalse();
    expect(console.error).toHaveBeenCalled();
  });

  it('should rotate facts every 10 seconds', fakeAsync(() => {
    component.ngOnInit();
    const initialFact = component.currentFact;
    
    // Move forward 10 seconds
    tick(10001);
    expect(component.currentFact).not.toBe(initialFact);
    
    // Move forward another 10 seconds
    const secondFact = component.currentFact;
    tick(10001);
    expect(component.currentFact).not.toBe(secondFact);
    
    // Cleanup interval
    discardPeriodicTasks();
  }));

  it('should trigger a message when askAboutFact is called', () => {
    spyOn(chatService, 'triggerMessage');
    component.currentFact = { text: 'Fact', query: 'Query' };
    
    component.askAboutFact();
    
    expect(chatService.triggerMessage).toHaveBeenCalledWith('Query');
  });
});

/** Helper to cleanup intervals in tests */
import { discardPeriodicTasks } from '@angular/core/testing';

