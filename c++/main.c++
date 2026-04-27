#define WINHELP "winhelp.hpp"
#include "../winhelpgui/src/ver2/winhelpgui.hpp"
#include <unordered_map>
#include <string>
#include <iostream>
using vec3 = winhelp::vec3;
using vec2 = winhelp::vec2;
using ivec2 = winhelp::ivec2;
using winevent = winhelp::events::event;
template <typename T, typename T1>
using umap = std::unordered_map<T, T1>;
using string = std::string;

const int width = 900, height = 600;
const vec2 ScreenSize = {
    (float)width, (float)height - 50 // buffer space
};
const vec3 ScreenColour = {30, 30, 40};
const int fontsize = 24;

const vec2 ReplaceListSize = {
    ScreenSize.x - (ScreenSize.x * (float)0.65), // 35% width
    ScreenSize.y - (ScreenSize.y * (float)0.10), // 90% height 
};

const float InputSpaceingBuffer = 10;
const float InputRowY = ReplaceListSize.y + InputSpaceingBuffer; // 90% heigh is for list rest in for inpu
const float InputRowWidth = ReplaceListSize.x - (InputSpaceingBuffer * 2);

const vec2 InputIDPos = {
    0, InputRowY
};
const vec2 InputIDSize = {
    InputRowWidth * (float)0.4,
    std::min((float)((ScreenSize - InputIDPos).y), 35.0f)
};

const vec2 InputBytePos = {
    InputIDSize.x + InputSpaceingBuffer, InputRowY
};
const vec2 InputByteSize = InputIDSize;

const vec2 InputAddBPos = {
    InputBytePos.x + InputByteSize.x + InputSpaceingBuffer,
    InputRowY
};
const vec2 InputAddBSize = {
    (InputRowWidth * (float)0.2),
    InputByteSize.y    
};

const vec2 ASMEditorPos = {
    ReplaceListSize.x + 20, // buffer 
    0
};

const vec2 ASMEditorSize = {
    ScreenSize.x - ASMEditorPos.x,
    ScreenSize.y
};

winhelp::display d{{width, height}, "Assembler"};
winhelp::Font font(24);

winhelpgui::ListUI ReplaceList({0, 0}, ReplaceListSize, {ScreenColour.x-10, ScreenColour.y-10, ScreenColour.z-10, 255}); // 16 (opcodes) + 8 (registors) 
umap<string, int> ReplaceListHash = {};

winhelpgui::TextInputBox IDinput(
    "name", InputIDPos, InputIDSize, 
    {ScreenColour.x-10, ScreenColour.y-10, ScreenColour.z-10},
    {255, 255, 255}, 0 
);
winhelpgui::TextInputBox Byteinput(
    "number", InputBytePos, InputByteSize,
    {ScreenColour.x-10, ScreenColour.y-10, ScreenColour.z-10},
    {255, 255, 255}, 0
);
winhelpgui::TextButton AddInputButton(
    "ADD", InputAddBPos, InputAddBSize, 
    {100, 255, 100}, {0, 0, 0}, 0
);

winhelpgui::TextInputBox ASMEditor(
    "Code", ASMEditorPos, ASMEditorSize,
    {ScreenColour.x-10, ScreenColour.y-10, ScreenColour.z-10},
    {255, 255, 255}, 10
);

const int bufferPerItem = 10;
static winhelpgui::ContainerUI holderBase({0, 0}, {ReplaceListSize.x, 50 + (bufferPerItem*2)});

const vec2 StringHolderPos = {
    bufferPerItem,
    bufferPerItem
};

const vec2 StringHolderSize = {
    holderBase.size.x * 0.8f - bufferPerItem,
    holderBase.size.y - (bufferPerItem * 2)
};

const vec2 RemoveButtonPos = {
    StringHolderPos.x + StringHolderSize.x,
    StringHolderPos.y
};

const vec2 RemoveButtonSize = {
    holderBase.size.x * 0.2f,
    StringHolderSize.y
};

static winhelpgui::TextButton RemoveButtonBase(
    "X", RemoveButtonPos,
    RemoveButtonSize, {255, 100, 100},
    {255, 255, 255}, 0
);

static winhelpgui::TextBox StringHolderBase(
    "PlaceHolder", StringHolderPos, StringHolderSize,
    {ScreenColour.x-10, ScreenColour.y-10, ScreenColour.z-10},
    {255, 255, 255}, StringHolderSize.y
);

void RemoveButtonOnRelease(winhelpgui::UIElement& self_) {
    winhelpgui::TextButton* self = dynamic_cast<winhelpgui::TextButton*>(&self_);
    if (!self) return;
    // Get the holder (parent of the button)
    winhelpgui::ContainerUI* holder = dynamic_cast<winhelpgui::ContainerUI*>(self->parent);
    if (!holder) return;
    // Get the list (parent of the holder)
    winhelpgui::ListUI* list = dynamic_cast<winhelpgui::ListUI*>(holder->parent);
    if (!list) return;
    // Remove from hash
    // Find the textbox, assume it's the second child
    if (holder->Nchildren() > 1) {
        winhelpgui::TextBox* stringHolder = dynamic_cast<winhelpgui::TextBox*>(holder->get(1));
        if (stringHolder) {
            std::string text = stringHolder->text;
            size_t colon = text.find(':');
            if (colon != std::string::npos) {
                std::string key = text.substr(0, colon);
                ReplaceListHash.erase(key);
            }
        }
    }
    // Remove from list
    list->remove(holder);
}

winhelpgui::ContainerUI* MakeItemForList(std::string str) {

    winhelpgui::ContainerUI* holder = new winhelpgui::ContainerUI(
        holderBase.pos,
        holderBase.size
    );
    
    winhelpgui::TextButton* removeButton = new winhelpgui::TextButton(
        RemoveButtonBase
    );

    winhelpgui::TextBox* stringHolder = new winhelpgui::TextBox(
        StringHolderBase
    );

    stringHolder->text = str;

    holder->add(removeButton); // index 0
    holder->add(stringHolder); // index 1

    return holder;
}

void AddItemOnAddReleased(winhelpgui::UIElement& self_) {
    winhelpgui::TextButton* self = dynamic_cast<winhelpgui::TextButton*>(&self_);
    if (!self) return;

    ReplaceListHash[IDinput.text] = std::stoi(Byteinput.text);
    std::cout << IDinput.text << ": " << Byteinput.text << "\n";
    ReplaceList.add(MakeItemForList(IDinput.text + ": " + Byteinput.text));
    return;
}

int main() {

    RemoveButtonBase.on_released(RemoveButtonOnRelease);

    AddInputButton.on_released(AddItemOnAddReleased);

    IDinput.fitToSizeMin(10);
    Byteinput.font.setSize(IDinput.font_size);
    AddInputButton.fitToSizeMin(10);

    ASMEditor.font.setSize(21);

    while (true) {
        d.surface.fill(ScreenColour);

        std::vector<winevent> events = winhelp::events::get();
        for (winevent& event : events) {
            if (event.type == winhelp::events::eventTypes::quit) {
                d.close();
                return 0;
            }
        }

        ReplaceList.tick(d.surface, events);

        Byteinput.tick(d.surface, events);
        IDinput.tick(d.surface, events);
        AddInputButton.tick(d.surface, events);

        ASMEditor.tick(d.surface, events);

        d.flip();
        winhelp::tick(60);
    }
}